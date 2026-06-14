import { describe, expect, it, vi } from 'vitest';

import { parseConfig } from './config';
import { createPiclawRuntime } from './runtime';

const config = parseConfig({
  telegram: { enabled: false, allowedUserIds: [] },
  devCli: { enabled: true },
  rootPath: '.',
  server: { services: [], logFiles: [] },
});

describe('runtime', () => {
  it('exposes extension API backed by runtime registries', async () => {
    const runtime = createPiclawRuntime(config, { error: vi.fn(), warn: vi.fn(), info: vi.fn() });

    runtime.api.registerCommand({ name: 'hello', description: 'hello', handler: () => 'ok' });
    runtime.api.registerTool({ name: 'tool', description: 'tool', handler: () => 'result' });
    runtime.api.registerCronjob({ name: 'job', schedule: '* * * * *', handler: () => undefined });
    runtime.api.registerProvider('provider', { name: 'provider' });
    runtime.api.on('app_start', () => ({ patch: { startedAt: 'changed' } }));

    expect(runtime.commands.get('hello')).toBeDefined();
    await expect(runtime.tools.call('tool', {})).resolves.toBe('result');
    expect(runtime.cronjobs.get('job')).toBeDefined();
    expect(runtime.providers.get('provider')).toBeDefined();
    await expect(runtime.events.dispatch('app_start', { startedAt: 'now' })).resolves.toMatchObject({
      event: { startedAt: 'changed' },
    });
    expect(runtime.api.unregisterProvider('provider')).toBe(true);
  });
});
