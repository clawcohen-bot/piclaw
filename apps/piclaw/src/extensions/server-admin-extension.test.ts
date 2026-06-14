import { describe, expect, it, vi, beforeEach } from 'vitest';

import { parseConfig } from '../core/config';
import { createPiclawRuntime } from '../core/runtime';
import { registerServerAdminExtension } from './server-admin-extension';

const serverMock = vi.hoisted(() => ({
  formatServices: vi.fn(() => '- demo.service'),
  getServerStatus: vi.fn(async () => 'uptime ok'),
  readAllowedLogs: vi.fn(async () => 'log line'),
  restartAllowedService: vi.fn(async () => 'restarted demo.service'),
}));

vi.mock('../server/server', () => serverMock);

const createRuntime = () => createPiclawRuntime(parseConfig({
  telegram: { allowedUserIds: [] },
  rootPath: '.',
  server: { services: ['demo.service'], logFiles: ['app.log'] },
  extensions: [],
  packages: [],
  devCli: { enabled: true },
  voice: { whisperCommand: 'whisper', whisperModel: 'model', ffmpegCommand: 'ffmpeg', extraArgs: [], timeoutMs: 1 },
}), { error: vi.fn(), warn: vi.fn(), info: vi.fn() });

describe('registerServerAdminExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers server admin commands', () => {
    const runtime = createRuntime();
    registerServerAdminExtension(runtime.api);

    expect(runtime.commands.get('server-status')).toBeDefined();
    expect(runtime.commands.get('server-services')).toBeDefined();
    expect(runtime.commands.get('server-logs')).toBeDefined();
    expect(runtime.commands.get('server-restart')).toBeDefined();
  });

  it('shows status and logs through connector HTML replies when available', async () => {
    const runtime = createRuntime();
    registerServerAdminExtension(runtime.api);
    const reply = vi.fn(async () => undefined);

    await expect(runtime.commands.get('server-status')?.handler({
      name: 'server-status',
      args: '',
      rawText: '/server-status',
      context: { reply },
    })).resolves.toBeUndefined();

    await expect(runtime.commands.get('server-logs')?.handler({
      name: 'server-logs',
      args: 'demo.service',
      rawText: '/server-logs demo.service',
      context: { reply },
    })).resolves.toBeUndefined();

    expect(reply).toHaveBeenCalledWith('<pre>uptime ok</pre>', { parse_mode: 'HTML' });
    expect(reply).toHaveBeenCalledWith('<pre>log line</pre>', { parse_mode: 'HTML' });
  });

  it('returns plain text without connector reply support', async () => {
    const runtime = createRuntime();
    registerServerAdminExtension(runtime.api);

    await expect(runtime.commands.get('server-status')?.handler({
      name: 'server-status',
      args: '',
      rawText: '/server-status',
    })).resolves.toBe('uptime ok');
    expect(runtime.commands.get('server-services')?.handler({
      name: 'server-services',
      args: '',
      rawText: '/server-services',
    })).toBe('- demo.service');
  });

  it('validates log and restart inputs and delegates allowed operations', async () => {
    const runtime = createRuntime();
    registerServerAdminExtension(runtime.api);
    const reply = vi.fn(async () => undefined);

    await expect(runtime.commands.get('server-logs')?.handler({
      name: 'server-logs',
      args: '',
      rawText: '/server-logs',
    })).resolves.toBe('Use /server-logs <name>');

    await expect(runtime.commands.get('server-restart')?.handler({
      name: 'server-restart',
      args: 'demo.service',
      rawText: '/server-restart demo.service',
      context: { reply },
    })).resolves.toBe('restarted demo.service');

    expect(reply).toHaveBeenCalledWith('Restarting demo.service...');
    expect(serverMock.restartAllowedService).toHaveBeenCalledWith(runtime.config, 'demo.service');
  });

  it('formats server errors inside the extension', async () => {
    const runtime = createRuntime();
    registerServerAdminExtension(runtime.api);
    serverMock.getServerStatus.mockRejectedValueOnce(new Error('boom'));

    await expect(runtime.commands.get('server-status')?.handler({
      name: 'server-status',
      args: '',
      rawText: '/server-status',
    })).resolves.toBe('Server status failed: boom');
  });
});
