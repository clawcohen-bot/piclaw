import { describe, expect, it, vi } from 'vitest';

import { parseConfig } from '../core/config';
import { createPiclawRuntime } from '../core/runtime';
import { registerAgentControlExtension } from './agent-control-extension';

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

describe('registerAgentControlExtension', () => {
  it('registers usage and cancel commands against the shared runner', async () => {
    const runtime = createRuntime();
    const runner = {
      getCurrentContextUsage: vi.fn(async () => ({ usage: { usedTokens: 15 }, model: { provider: 'provider-a', id: 'model-a' } })),
      cancelActiveTask: vi.fn(async () => true),
    };

    registerAgentControlExtension(runtime.api, runner as never);

    await expect(runtime.commands.get('usage')?.handler(commandInput('usage', '', { conversationId: '42' }))).resolves.toContain('model-a');
    expect(runner.getCurrentContextUsage).toHaveBeenCalledWith(42);
    await expect(runtime.commands.get('cancel')?.handler(commandInput('cancel'))).resolves.toBe('Cancelled active task.');
  });

  it('validates usage conversation and reports missing active task', async () => {
    const runtime = createRuntime();
    const runner = {
      getCurrentContextUsage: vi.fn(),
      cancelActiveTask: vi.fn(async () => false),
    };
    registerAgentControlExtension(runtime.api, runner as never);

    await expect(runtime.commands.get('usage')?.handler(commandInput('usage'))).resolves.toBe('Cannot show usage without chat.');
    await expect(runtime.commands.get('usage')?.handler(commandInput('usage', '', { conversationId: 'abc' }))).resolves.toBe('Cannot show usage without numeric chat.');
    await expect(runtime.commands.get('cancel')?.handler(commandInput('cancel'))).resolves.toBe('No active task.');
  });

  it('routes busy callback decisions through the shared runner', async () => {
    const runtime = createRuntime();
    const runner = {
      queuePendingTask: vi.fn(() => true),
      cancelAndQueuePendingTask: vi.fn(async () => true),
      ignorePendingTask: vi.fn(() => true),
    };
    registerAgentControlExtension(runtime.api, runner as never);

    const answerCbQuery = vi.fn(async () => undefined);
    const reply = vi.fn(async () => undefined);
    await runtime.callbacks.handle({ data: 'busy:queue:abc', context: { answerCbQuery, reply } });
    expect(runner.queuePendingTask).toHaveBeenCalledWith('abc');
    expect(answerCbQuery).toHaveBeenCalledWith('Queued');
    expect(reply).toHaveBeenCalledWith('Queued task.');

    await runtime.callbacks.handle({ data: 'busy:cancel:def', context: { answerCbQuery, reply } });
    expect(runner.cancelAndQueuePendingTask).toHaveBeenCalledWith('def');
    expect(reply).toHaveBeenCalledWith('Cancelled current task and queued new task.');

    await runtime.callbacks.handle({ data: 'busy:ignore:ghi', context: { answerCbQuery, reply } });
    expect(runner.ignorePendingTask).toHaveBeenCalledWith('ghi');
    expect(reply).toHaveBeenCalledWith('Ignored new task.');
  });

  it('handles invalid and expired busy actions', async () => {
    const runtime = createRuntime();
    const runner = {
      queuePendingTask: vi.fn(() => false),
      cancelAndQueuePendingTask: vi.fn(async () => false),
      ignorePendingTask: vi.fn(() => false),
    };
    registerAgentControlExtension(runtime.api, runner as never);

    const answerCbQuery = vi.fn(async () => undefined);
    await runtime.callbacks.get('busy')?.handler({ name: 'busy', data: 'busy:queue', context: { answerCbQuery } });
    expect(answerCbQuery).toHaveBeenCalledWith('Invalid busy action');

    await runtime.callbacks.handle({ data: 'busy:queue:abc', context: { answerCbQuery } });
    await runtime.callbacks.handle({ data: 'busy:cancel:def', context: { answerCbQuery } });
    await runtime.callbacks.handle({ data: 'busy:ignore:ghi', context: { answerCbQuery } });
    expect(answerCbQuery).toHaveBeenCalledWith('Task expired');
  });
});
