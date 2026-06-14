import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseConfig } from '../core/config';
import { createPiclawRuntime } from '../core/runtime';
import { readAgentMode } from '../agent/mode';
import { registerAppControlExtension } from './app-control-extension';

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

const commandInput = (name: string, args = '', extra: Record<string, unknown> = {}) => ({
  name,
  args,
  rawText: `/${name}${args.length > 0 ? ` ${args}` : ''}`,
  ...extra,
});

const createRunner = () => ({ taskState: { activeTask: undefined, queuedTasks: [] } }) as never;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'app-control-extension-test-'));
  process.chdir(tempDir);
  vi.useFakeTimers();
});

afterEach(async () => {
  vi.useRealTimers();
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('registerAppControlExtension', () => {
  it('registers start, status, and skills commands', async () => {
    const runtime = createRuntime();
    registerAppControlExtension(runtime.api, { agentRunner: createRunner() });

    expect(runtime.commands.get('start')?.handler(commandInput('start'))).toContain('Root:');
    await expect(runtime.commands.get('status')?.handler(commandInput('status', '', { conversationId: '42' }))).resolves.toContain('Status: ok');

    const reply = vi.fn(async () => undefined);
    await runtime.commands.get('skills')?.handler(commandInput('skills', '', { context: { reply } }));
    expect(reply).toHaveBeenCalledWith(expect.any(String), { parse_mode: 'HTML' });
  });

  it('shows and changes mode', async () => {
    const runtime = createRuntime();
    registerAppControlExtension(runtime.api, { agentRunner: createRunner() });

    await expect(runtime.commands.get('mode')?.handler(commandInput('mode'))).resolves.toBe('Cannot use /mode without chat.');
    await expect(runtime.commands.get('mode')?.handler(commandInput('mode', '', { conversationId: 'abc' }))).resolves.toBe('Cannot use /mode without numeric chat.');
    await expect(runtime.commands.get('mode')?.handler(commandInput('mode', 'bad', { conversationId: '42' }))).resolves.toBe('Unknown mode. Use /mode agent or /mode ask');
    await expect(runtime.commands.get('mode')?.handler(commandInput('mode', 'ask', { conversationId: '42' }))).resolves.toBe('Mode changed to ask (read-only).');
    await expect(readAgentMode(42)).resolves.toBe('ask');
    await expect(runtime.commands.get('mode')?.handler(commandInput('mode', '', { conversationId: '42' }))).resolves.toContain('Current mode: ask (read-only)');
  });

  it('runs reload callback when available', async () => {
    const runtime = createRuntime();
    const reload = vi.fn();
    registerAppControlExtension(runtime.api, { agentRunner: createRunner(), reload });

    const reply = vi.fn(async () => undefined);
    await runtime.commands.get('reload')?.handler(commandInput('reload', '', { context: { reply } }));
    expect(reply).toHaveBeenCalledWith('Reloading bot...');
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reports unavailable reload and returns skills text without reply context', async () => {
    const runtime = createRuntime();
    registerAppControlExtension(runtime.api, { agentRunner: createRunner() });

    await expect(runtime.commands.get('reload')?.handler(commandInput('reload'))).resolves.toBe('Reload is not available.');
    await expect(runtime.commands.get('skills')?.handler(commandInput('skills'))).resolves.toContain('skills');
  });
});
