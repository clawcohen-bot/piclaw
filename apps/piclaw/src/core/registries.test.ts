import { describe, expect, it, vi } from 'vitest';

import { createEventBus } from './events';
import { createCommandRegistry, createCronjobRegistry, createProviderRegistry, createToolRegistry } from './registries';

describe('registries', () => {
  it('registers commands', () => {
    const commands = createCommandRegistry();
    const unregister = commands.register({ name: 'Hello', description: 'test', handler: () => 'ok' });

    expect(commands.get('hello')?.description).toBe('test');
    expect(commands.list().map((command) => command.name)).toEqual(['hello']);

    unregister();
    expect(commands.get('hello')).toBeUndefined();
  });

  it('calls tools through tool events', async () => {
    const events = createEventBus();
    events.on('tool_call', () => ({ patch: { input: 2 } }));
    const resultHandler = vi.fn();
    events.on('tool_result', resultHandler);

    const tools = createToolRegistry(events);
    tools.register({ name: 'double', description: 'double input', handler: (input) => Number(input) * 2 });

    await expect(tools.call('double', 1)).resolves.toBe(4);
    expect(resultHandler).toHaveBeenCalledWith(
      { name: 'double', input: 2, result: 4 },
      expect.objectContaining({ eventName: 'tool_result' }),
    );
  });

  it('blocks tools through tool_call', async () => {
    const events = createEventBus();
    events.on('tool_call', () => ({ blocked: true, reason: 'blocked' }));

    const tools = createToolRegistry(events);
    tools.register({ name: 'x', description: 'x', handler: () => 'no' });

    await expect(tools.call('x', {})).rejects.toThrow('blocked');
  });

  it('registers cronjobs and providers', async () => {
    const events = createEventBus();
    const tick = vi.fn();
    events.on('cron_tick', tick);
    const cronjobs = createCronjobRegistry(events);
    const handler = vi.fn();
    cronjobs.register({ name: 'daily', schedule: '0 18 * * *', handler });

    await expect(cronjobs.tick('daily', 'now')).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith({ scheduledAt: 'now' });
    expect(tick).toHaveBeenCalledOnce();

    const providers = createProviderRegistry();
    providers.register('Local', { name: 'ignored', models: ['m'] });
    expect(providers.get('local')?.models).toEqual(['m']);
    expect(providers.list().map((provider) => provider.name)).toEqual(['local']);
    expect(providers.unregister('local')).toBe(true);
    expect(providers.get('local')).toBeUndefined();
  });

  it('returns false for missing cronjob and throws for missing tool', async () => {
    const cronjobs = createCronjobRegistry();
    await expect(cronjobs.tick('missing')).resolves.toBe(false);

    const tools = createToolRegistry();
    await expect(tools.call('missing', {})).rejects.toThrow('Unknown tool');
  });
});
