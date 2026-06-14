import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseConfig } from '../core/config';
import { createPiclawRuntime } from '../core/runtime';
import { readMarkdownMemory, readShortMemory, readSessionSummary, writeSessionSummary, writeShortMemory } from '../memory/memory';
import { registerMemoryExtension } from './memory-extension';

const originalCwd = process.cwd();
let tempDir: string;

const createRuntime = () => createPiclawRuntime(parseConfig({
  telegram: { allowedUserIds: [] },
  devCli: { enabled: true },
  rootPath: '.',
  server: { services: [], logFiles: [] },
  extensions: [],
  packages: [],
  models: { providers: {} },
}));

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'memory-extension-test-'));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

const commandInput = (name: string, args: string, extra: Record<string, unknown> = {}) => ({
  name,
  args,
  rawText: `/${name}${args.length > 0 ? ` ${args}` : ''}`,
  ...extra,
});

describe('registerMemoryExtension', () => {
  it('registers remember, forget, and memory commands', async () => {
    const runtime = createRuntime();
    registerMemoryExtension(runtime.api);

    await expect(runtime.commands.get('remember')?.handler(commandInput('remember', 'keep this'))).resolves.toBe('Saved to memory.');
    expect(await readMarkdownMemory()).toContain('keep this');

    const reply = vi.fn(async () => undefined);
    await runtime.commands.get('memory')?.handler(commandInput('memory', '', { context: { reply } }));
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Long memory:'), { parse_mode: 'HTML' });

    await expect(runtime.commands.get('forget')?.handler(commandInput('forget', ''))).resolves.toBe('Forgot saved long-term memory.');
    expect(await readMarkdownMemory()).toBe('');
  });

  it('returns fallback text when no reply context is available', async () => {
    const runtime = createRuntime();
    registerMemoryExtension(runtime.api);

    await expect(runtime.commands.get('remember')?.handler(commandInput('remember', ''))).resolves.toBe('Use /remember <text>');
    await expect(runtime.commands.get('memory')?.handler(commandInput('memory', ''))).resolves.toContain('Long memory:');
  });

  it('clears short context while keeping long-term memory', async () => {
    const runtime = createRuntime();
    registerMemoryExtension(runtime.api);
    await runtime.commands.get('remember')?.handler(commandInput('remember', 'keep long memory'));
    await writeSessionSummary('compact summary');
    await writeShortMemory(123, 'server-root', [{
      role: 'user',
      text: 'short',
      timestamp: '2026-01-01T00:00:00.000Z',
      rootId: 'server-root',
      messageId: 1,
    }]);

    await expect(runtime.commands.get('new')?.handler(commandInput('new', '', {
      conversationId: '123',
    }))).resolves.toBe('Started new context. Memory was kept.');

    expect(await readShortMemory(123, 'server-root')).toEqual([]);
    expect(await readSessionSummary()).toBe('');
    expect(await readMarkdownMemory()).toContain('keep long memory');

    await expect(runtime.commands.get('new')?.handler(commandInput('new', ''))).resolves.toBe('Cannot start new context without chat.');
    await expect(runtime.commands.get('new')?.handler(commandInput('new', '', { conversationId: 'abc' }))).resolves.toBe('Cannot start new context without numeric chat.');
  });
});
