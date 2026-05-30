import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

import type { AppConfig } from '../core/config';
import { formatServices, getServerStatus, readAllowedLogs, restartAllowedService } from './server';

const execFileMock = vi.mocked(execFile);
const originalCwd = process.cwd();
let tempDir: string;

const config = (): AppConfig => ({
  telegram: { enabled: true, allowedUserIds: [1] },
  slack: { enabled: false, allowedUserIds: [] },
  devCli: { enabled: false },
  rootPath: tempDir,
  server: { services: ['demo.service'], logFiles: [resolve(tempDir, 'app.log')] },
  voice: { whisperCommand: 'whisper', whisperModel: 'model', ffmpegCommand: 'ffmpeg', extraArgs: [], timeoutMs: 1000 },
});

const mockExecFile = (stdout: string, stderr = '') => {
  execFileMock.mockImplementation(((command: string, args: readonly string[], callbackOrOptions?: unknown, maybeCallback?: unknown) => {
    const callback = typeof callbackOrOptions === 'function' ? callbackOrOptions : maybeCallback;
    (callback as (error: null, result: { stdout: string; stderr: string }) => void)(null, { stdout: `${command} ${args.join(' ')} ${stdout}`.trim(), stderr });
    return {};
  }) as never);
};

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'server-test-'));
  process.chdir(tempDir);
  execFileMock.mockReset();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('server helpers', () => {
  it('collects server status from system commands', async () => {
    mockExecFile('ok');
    const status = await getServerStatus();
    expect(status).toContain('Uptime:');
    expect(status).toContain('Memory:');
    expect(status).toContain('Disk:');
    expect(execFileMock).toHaveBeenCalledWith('uptime', [], expect.any(Function));
  });

  it('formats configured services', () => {
    expect(formatServices(config())).toBe('- demo.service');
    expect(formatServices({ ...config(), server: { services: [], logFiles: [] } })).toBe('No services configured.');
  });

  it('reads allowed journal and file logs and blocks unknown names', async () => {
    mockExecFile('journal output');
    await writeFile(resolve(tempDir, 'app.log'), Array.from({ length: 90 }, (_, i) => `line ${i}`).join('\n'));
    expect(await readAllowedLogs(config(), 'demo.service')).toContain('journalctl -u demo.service');
    expect(await readAllowedLogs(config(), resolve(tempDir, 'app.log'))).toContain('line 89');
    await expect(readAllowedLogs(config(), 'blocked')).rejects.toThrow('Log is not allowed: blocked');
  });

  it('restarts only configured services', async () => {
    execFileMock.mockImplementation(((_command: string, _args: readonly string[], callbackOrOptions?: unknown, maybeCallback?: unknown) => {
      const callback = typeof callbackOrOptions === 'function' ? callbackOrOptions : maybeCallback;
      (callback as (error: null, result: { stdout: string; stderr: string }) => void)(null, { stdout: '', stderr: '' });
      return {};
    }) as never);
    expect(await restartAllowedService(config(), 'demo.service')).toBe('Restarted demo.service');
    await expect(restartAllowedService(config(), 'blocked')).rejects.toThrow('Service is not allowed: blocked');
  });
});
