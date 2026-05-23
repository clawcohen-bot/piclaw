import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApprovalKeyboard } from '../approval';
import { createAuthMiddleware, isAllowedUser } from '../auth';
import { helpText } from '../commands';
import { parseConfig } from '../config';
import { getErrorMessage } from '../error';
import { codeBlock, telegramHtmlFromMarkdown } from '../format';
import {
  addShortMemoryMessage,
  clearSessionSummary,
  clearShortMemory,
  readMarkdownMemory,
  readSessionSummary,
  readShortMemory,
  remember,
  writeSessionSummary,
  writeShortMemory,
  type ShortMemoryMessage,
} from '../memory';
import { formatAgentMode, isAgentMode, readAgentMode, writeAgentMode } from '../mode';
import { getAvailablePackages, formatPackagesList } from '../packages';
import { resolveSystemPath } from '../path';
import { formatServices } from '../server';
import { ensureAppDirs, getAppDir, getChatModePath, getPiAgentDir } from '../storage';
import { createTaskState, isBusy, popQueuedTask, queueTask } from '../task-state';
import { getChatId, getUserId } from '../telegram-context';
import { getMessageId, getMessageText } from '../telegram-text';
import { getCommandPayload, truncateText } from '../text';

const originalCwd = process.cwd();
let tempDir: string;

const baseConfig = {
  telegram: { allowedUserIds: [1, 2] },
  rootPath: '.',
  server: { services: ['svc'], logFiles: ['log.txt'] },
};

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'piclaw-test-'));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('text and format helpers', () => {
  it('extracts command payloads', () => {
    expect(getCommandPayload('/remember hello world')).toBe('hello world');
    expect(getCommandPayload('  /mode   ask  ')).toBe('ask');
    expect(getCommandPayload('/status')).toBe('');
  });

  it('truncates text with an ellipsis', () => {
    expect(truncateText('abc', 3)).toBe('abc');
    expect(truncateText('abcdef', 4)).toBe('abc…');
  });

  it('formats code and telegram html text', () => {
    expect(codeBlock('x')).toBe('<pre>x</pre>');
    expect(telegramHtmlFromMarkdown('# Title\n**bold**')).toBe('<b>Title</b>\n<b>bold</b>');
  });
});

describe('config and paths', () => {
  it('resolves relative and absolute paths', () => {
    expect(resolveSystemPath('/tmp/base', 'a/b')).toBe(resolve('/tmp/base/a/b'));
    expect(resolveSystemPath('/tmp/base', '/var/log')).toBe(resolve('/var/log'));
  });

  it('parses config and default voice settings', () => {
    const config = parseConfig(baseConfig);
    expect(config.telegram.allowedUserIds).toEqual([1, 2]);
    expect(config.rootPath).toBe(resolve(tempDir));
    expect(config.server.logFiles).toEqual([resolve(tempDir, 'log.txt')]);
    expect(config.voice.whisperCommand).toBe('whisper-cli');
    expect(config.voice.extraArgs).toEqual(['--no-prints']);
  });

  it('parses custom voice settings', () => {
    const config = parseConfig({
      ...baseConfig,
      voice: {
        whisperCommand: 'whisper',
        whisperModel: 'model.bin',
        ffmpegCommand: 'avconv',
        extraArgs: ['--x'],
        timeoutMs: 1,
      },
    });
    expect(config.voice).toMatchObject({ whisperCommand: 'whisper', ffmpegCommand: 'avconv', extraArgs: ['--x'], timeoutMs: 1 });
    expect(config.voice.whisperModel).toBe(resolve(tempDir, 'model.bin'));
  });

  it('rejects invalid config shapes', () => {
    expect(() => parseConfig(null)).toThrow('Config must be an object');
    expect(() => parseConfig({ ...baseConfig, telegram: {} })).toThrow('telegram.allowedUserIds');
    expect(() => parseConfig({ ...baseConfig, rootPath: 1 })).toThrow('rootPath');
    expect(() => parseConfig({ ...baseConfig, server: { services: [1], logFiles: [] } })).toThrow('server.services');
    expect(() => parseConfig({ ...baseConfig, voice: 1 })).toThrow('voice must be an object');
    expect(() => parseConfig({ ...baseConfig, voice: { whisperCommand: 1 } })).toThrow('whisperCommand');
    expect(() => parseConfig({ ...baseConfig, voice: { whisperModel: 1 } })).toThrow('whisperModel');
    expect(() => parseConfig({ ...baseConfig, voice: { ffmpegCommand: 1 } })).toThrow('ffmpegCommand');
    expect(() => parseConfig({ ...baseConfig, voice: { extraArgs: [1] } })).toThrow('extraArgs');
    expect(() => parseConfig({ ...baseConfig, voice: { timeoutMs: 'bad' } })).toThrow('timeoutMs');
  });

  it('creates app directories', async () => {
    await ensureAppDirs();
    await expect(readFile(join(getAppDir(), 'memory.md'), 'utf8')).rejects.toThrow();
    await writeFile(join(getPiAgentDir(), 'skills', 'ok.txt'), 'ok');
    await expect(readFile(join(getPiAgentDir(), 'skills', 'ok.txt'), 'utf8')).resolves.toBe('ok');
  });
});

describe('mode, task state, auth and telegram helpers', () => {
  it('validates and formats modes', async () => {
    expect(isAgentMode('agent')).toBe(true);
    expect(isAgentMode('ask')).toBe(true);
    expect(isAgentMode('x')).toBe(false);
    expect(formatAgentMode('ask')).toBe('ask (read-only)');
    expect(formatAgentMode('agent')).toBe('agent (full access)');
    expect(await readAgentMode(123)).toBe('agent');
    await writeAgentMode(123, 'ask');
    expect(await readFile(getChatModePath(123), 'utf8')).toBe('ask\n');
    expect(await readAgentMode(123)).toBe('ask');
    await writeFile(getChatModePath(123), 'bad\n');
    expect(await readAgentMode(123)).toBe('agent');
  });

  it('queues tasks', () => {
    const state = createTaskState();
    expect(isBusy(state)).toBe(false);
    state.activeTask = { abort: vi.fn() };
    expect(isBusy(state)).toBe(true);
    queueTask(state, 'a');
    queueTask(state, 'b');
    expect(popQueuedTask(state)).toBe('a');
    expect(popQueuedTask(state)).toBe('b');
    expect(popQueuedTask(state)).toBeUndefined();
  });

  it('checks authorization and telegram shapes', async () => {
    const config = parseConfig(baseConfig);
    expect(isAllowedUser(config, 1)).toBe(true);
    expect(isAllowedUser(config, 3)).toBe(false);
    expect(isAllowedUser(config, undefined)).toBe(false);

    const next = vi.fn(async () => undefined);
    const allowedReply = vi.fn(async () => undefined);
    await createAuthMiddleware(config)({ from: { id: 1 }, reply: allowedReply } as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(allowedReply).not.toHaveBeenCalled();

    const deniedReply = vi.fn(async () => undefined);
    await createAuthMiddleware(config)({ from: { id: 3 }, reply: deniedReply } as never, next);
    expect(deniedReply).toHaveBeenCalledWith('Access denied.');

    expect(getMessageText({ message: { message_id: 9, text: 'hi' } } as never)).toBe('hi');
    expect(getMessageText({ message: { message_id: 9 } } as never)).toBeUndefined();
    expect(getMessageId({ message: { message_id: 9 } } as never)).toBe(9);
    expect(getMessageId({ message: {} } as never)).toBeUndefined();
    expect(getChatId({ chat: { id: 7 } } as never)).toBe(7);
    expect(getChatId({ message: { chat: { id: 8 } } } as never)).toBe(8);
    expect(getChatId({ message: { chat: { id: 'bad' } } } as never)).toBeUndefined();
    expect(getChatId({ message: { chat: null } } as never)).toBeUndefined();
    expect(getChatId({ message: {} } as never)).toBeUndefined();
    expect(getUserId({ from: { id: 6 } } as never)).toBe(6);
  });
});

describe('memory and packages', () => {
  const message = (index: number): ShortMemoryMessage => ({
    role: index % 2 === 0 ? 'user' : 'bot',
    text: `msg ${index}`,
    timestamp: '2026-01-01T00:00:00.000Z',
    rootId: 'root',
    messageId: index,
  });

  it('reads and writes short memory with validation and limits', async () => {
    expect(await readShortMemory(1, 'root')).toEqual([]);
    await writeShortMemory(1, 'root', Array.from({ length: 35 }, (_, i) => message(i)));
    const messages = await readShortMemory(1, 'root');
    expect(messages).toHaveLength(30);
    expect(messages[0]?.messageId).toBe(5);
    await addShortMemoryMessage(1, message(99));
    expect((await readShortMemory(1, 'root')).at(-1)?.messageId).toBe(99);
    await clearShortMemory(1, 'root');
    expect(await readShortMemory(1, 'root')).toEqual([]);
    await writeFile(join(getAppDir(), 'short-memory', '1-root.json'), JSON.stringify([{ role: 'bad' }, message(1)]));
    expect(await readShortMemory(1, 'root')).toEqual([message(1)]);
    await writeFile(join(getAppDir(), 'short-memory', '1-root.json'), '{}');
    expect(await readShortMemory(1, 'root')).toEqual([]);
  });

  it('handles markdown memory and session summary', async () => {
    expect(await readMarkdownMemory()).toBe('');
    expect(await readSessionSummary()).toBe('');
    await remember('remember this');
    expect(await readMarkdownMemory()).toContain('remember this');
    await writeSessionSummary('  summary  ');
    expect(await readSessionSummary()).toBe('summary\n');
    await clearSessionSummary();
    expect(await readSessionSummary()).toBe('');
  });

  it('reads package settings safely', async () => {
    expect(await getAvailablePackages()).toEqual([]);
    expect(await formatPackagesList()).toBe('Packages:\n  none');
    await ensureAppDirs();
    await writeFile(join(getPiAgentDir(), 'settings.json'), JSON.stringify({ packages: ['b', 'a'] }));
    expect(await getAvailablePackages()).toEqual(['a', 'b']);
    expect(await formatPackagesList()).toBe('Packages:\n  - a\n  - b');
    await writeFile(join(getPiAgentDir(), 'settings.json'), JSON.stringify({ packages: [1] }));
    expect(await getAvailablePackages()).toEqual([]);
  });
});

describe('misc presentation helpers', () => {
  it('provides command help and approval keyboard', () => {
    expect(helpText).toContain('/remember <text>');
    expect(helpText).toContain('/server-status');
    expect(createApprovalKeyboard('abc')).toMatchObject({ reply_markup: { inline_keyboard: expect.any(Array) } });
  });

  it('formats services and errors', () => {
    expect(formatServices(parseConfig(baseConfig))).toBe('- svc');
    expect(formatServices(parseConfig({ ...baseConfig, server: { services: [], logFiles: [] } }))).toBe('No services configured.');
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('nope')).toBe('Unknown error');
  });
});
