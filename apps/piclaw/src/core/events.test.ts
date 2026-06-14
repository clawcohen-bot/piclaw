import { describe, expect, it, vi } from 'vitest';

import { createEventBus } from './events';

describe('event bus', () => {
  it('runs handlers in registration order', async () => {
    const events = createEventBus();
    const calls: string[] = [];

    events.on('app_start', () => {
      calls.push('first');
    });
    events.on('app_start', () => {
      calls.push('second');
    });

    await events.emit('app_start', { startedAt: 'now' });
    expect(calls).toEqual(['first', 'second']);
  });

  it('transforms and blocks dispatched events', async () => {
    const events = createEventBus();

    events.on('tool_call', () => ({ patch: { input: { value: 2 } } }));
    events.on('tool_call', (event) => ({ blocked: event.name === 'danger', reason: 'nope' }));

    await expect(events.dispatch('tool_call', { name: 'safe', input: { value: 1 } })).resolves.toEqual({
      blocked: false,
      event: { name: 'safe', input: { value: 2 } },
    });

    await expect(events.dispatch('tool_call', { name: 'danger', input: { value: 1 } })).resolves.toEqual({
      blocked: true,
      reason: 'nope',
      event: { name: 'danger', input: { value: 2 } },
    });
  });

  it('unregisters handlers and reports listener count', async () => {
    const events = createEventBus();
    const calls: string[] = [];
    const off = events.on('app_start', () => {
      calls.push('called');
    });

    expect(events.listenerCount('app_start')).toBe(1);
    off();
    expect(events.listenerCount('app_start')).toBe(0);
    await events.emit('app_start', { startedAt: 'now' });
    expect(calls).toEqual([]);
  });

  it('throws handler errors in fail-fast mode', async () => {
    const events = createEventBus({ crashOnHandlerError: true });
    events.on('app_start', () => {
      throw new Error('boom');
    });

    await expect(events.emit('app_start', { startedAt: 'now' })).rejects.toThrow('boom');
  });

  it('logs handler errors by default', async () => {
    const error = vi.fn();
    const events = createEventBus({ logger: { error, warn: vi.fn(), info: vi.fn() } });

    events.on('app_start', () => {
      throw new Error('boom');
    });

    await expect(events.emit('app_start', { startedAt: 'now' })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
  });
});
