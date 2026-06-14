import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VoiceConfig } from '../../core/config';
import { getAppDir, getObsidianVaultDir } from '../../core/storage';

type RegisteredItem = {
  name: string;
  handler: (input?: any) => unknown;
};

const originalCwd = process.cwd();
const repoRoot = originalCwd;
let tempDir: string;

const loadPackage = async (packageName: string) => {
  const extensionPath = resolve(repoRoot, 'packages', packageName, 'extensions', 'index.ts');
  const extension = await import(pathToFileURL(extensionPath).href);
  return extension.default as (piclaw: any) => void;
};

const createPackageHarness = (config: Record<string, unknown> = {}) => {
  const commands = new Map<string, RegisteredItem>();
  const callbacks = new Map<string, RegisteredItem & { pattern: RegExp }>();
  const tools = new Map<string, RegisteredItem>();

  return {
    piclaw: {
      config,
      registerCommand: (command: RegisteredItem) => commands.set(command.name, command),
      registerCallbackAction: (callback: RegisteredItem & { pattern: RegExp }) => callbacks.set(callback.name, callback),
      registerTool: (tool: RegisteredItem) => tools.set(tool.name, tool),
    },
    commands,
    callbacks,
    tools,
  };
};

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'piclaw-package-test-'));
  process.chdir(tempDir);
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('piclaw-wiki package', () => {
  it('registers wiki commands/tools and writes searchable notes through the package API', async () => {
    const harness = createPackageHarness();
    const registerWikiPackage = await loadPackage('piclaw-wiki');

    registerWikiPackage(harness.piclaw);

    expect(harness.commands.get('wiki')).toBeDefined();
    expect(harness.commands.get('wiki-add')).toBeDefined();
    expect(harness.commands.get('wiki-search')).toBeDefined();
    expect(harness.tools.get('wiki.add-note')).toBeDefined();
    expect(harness.tools.get('wiki.search')).toBeDefined();

    await expect(harness.commands.get('wiki-add')?.handler({ args: '' })).resolves.toBe('Use /wiki-add <text>');

    const addResult = (await harness.tools.get('wiki.add-note')?.handler({ text: 'Package wiki note', source: 'test' })) as { rawPath: string };
    expect(addResult).toMatchObject({ rawPath: expect.stringContaining('package-wiki-note') });
    await expect(readFile(join(getObsidianVaultDir(), addResult.rawPath), 'utf8')).resolves.toContain('Package wiki note');

    const searchResult = await harness.commands.get('wiki-search')?.handler({ args: 'Package wiki' });
    expect(searchResult).toContain('Wiki matches for: Package wiki');
  });
});

describe('piclaw-calendar-google package', () => {
  it('registers calendar commands/tools and handles missing/configured credentials safely', async () => {
    const harness = createPackageHarness();
    const registerCalendarPackage = await loadPackage('piclaw-calendar-google');

    registerCalendarPackage(harness.piclaw);

    expect(harness.commands.get('calendar')).toBeDefined();
    expect(harness.commands.get('calendar-connect')).toBeDefined();
    expect(harness.commands.get('calendar-add')).toBeDefined();
    expect(harness.callbacks.get('calendar-add-confirm')).toBeDefined();
    expect(harness.callbacks.get('calendar-add-cancel')).toBeDefined();
    expect(harness.tools.get('calendar.list-events')).toBeDefined();
    expect(harness.tools.get('calendar.create-event')).toBeDefined();

    await expect(harness.commands.get('calendar')?.handler()).resolves.toContain('Google Calendar configured: no');
    expect(harness.commands.get('calendar-connect')?.handler()).toContain('Google Calendar is not configured');
    await expect(harness.tools.get('calendar.list-events')?.handler({ start: '2026-05-25', end: '2026-05-26' })).rejects.toThrow(
      'Google Calendar is not configured',
    );

    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
    expect(harness.commands.get('calendar-connect')?.handler()).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    await expect(harness.commands.get('calendar-code')?.handler({ args: '' })).resolves.toBe('Use /calendar-code <redirect-url-or-code>');
  });

  it('keeps /calendar-add confirmation inside the calendar package callback registry', async () => {
    const harness = createPackageHarness();
    const registerCalendarPackage = await loadPackage('piclaw-calendar-google');
    registerCalendarPackage(harness.piclaw);

    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
    await mkdir(getAppDir(), { recursive: true });
    await writeFile(join(getAppDir(), 'google-calendar-token.json'), JSON.stringify({ refreshToken: 'refresh', accessToken: 'access', expiresAt: Date.now() + 3600_000 }), 'utf8');

    const reply = vi.fn();
    await expect(
      harness.commands.get('calendar-add')?.handler({
        args: 'Package meeting | 2026-05-25T10:00:00+03:00 | 2026-05-25T11:00:00+03:00',
        context: { reply },
      }),
    ).resolves.toBeUndefined();

    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Create this calendar event?'), expect.any(Object));
    const callbackData = reply.mock.calls[0]?.[1]?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data;
    expect(callbackData).toMatch(/^calendaradd:confirm:/);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'event-1',
          summary: 'Package meeting',
          start: { dateTime: '2026-05-25T10:00:00+03:00' },
          end: { dateTime: '2026-05-25T11:00:00+03:00' },
        }),
        { status: 200 },
      ),
    );

    await expect(
      harness.callbacks.get('calendar-add-confirm')?.handler({ data: callbackData, context: { answerCbQuery: vi.fn() } }),
    ).resolves.toContain('Created calendar event');

    await expect(
      harness.callbacks.get('calendar-add-cancel')?.handler({ data: callbackData.replace(':confirm:', ':cancel:'), context: { answerCbQuery: vi.fn() } }),
    ).resolves.toBe('Calendar event cancelled.');
  });
});

describe('piclaw-voice package', () => {
  it('registers voice command/tool entrypoints and validates Telegram transcription input', async () => {
    const voiceConfig: VoiceConfig = {
      whisperCommand: 'whisper',
      whisperModel: 'model.bin',
      ffmpegCommand: 'ffmpeg',
      extraArgs: [],
      timeoutMs: 1000,
    };
    const harness = createPackageHarness({ voice: voiceConfig });
    const registerVoicePackage = await loadPackage('piclaw-voice');

    registerVoicePackage(harness.piclaw);

    expect(harness.commands.get('voice')).toBeDefined();
    expect(harness.tools.get('voice.transcribe-buffer')).toBeDefined();
    expect(harness.tools.get('voice.transcribe-telegram-file')).toBeDefined();
    expect(harness.commands.get('voice')?.handler()).toBe('Voice package loaded. Send a Telegram voice message to transcribe it.');
    await expect(harness.tools.get('voice.transcribe-telegram-file')?.handler({ fileId: 'voice-id' })).rejects.toThrow(
      'Telegram file id and getFileLink callback are required',
    );
  });
});
