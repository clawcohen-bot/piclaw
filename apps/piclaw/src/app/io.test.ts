import { writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());
const execMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  exec: execMock,
}));

import { writeAuditEvent } from '../memory/audit';
import { parseConfig } from '../core/config';
import { getAuditLogPath } from '../core/storage';
import { getServerStatus, readAllowedLogs, restartAllowedService } from '../server/server';
import { createServerTools } from '../server/server-tools';
import { downloadTelegramFile, transcribeVoiceBuffer } from '../features/voice/voice';

const originalCwd = process.cwd();
let tempDir: string;

const configInput = {
  telegram: { allowedUserIds: [1] },
  rootPath: '.',
  server: { services: ['demo.service'], logFiles: ['app.log'] },
};

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'piclaw-io-test-'));
  process.chdir(tempDir);
  execFileMock.mockReset();
  execMock.mockReset();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const callbackSuccess = (stdout: string, stderr = '') => (cmd: string, args: string[], optionsOrCb?: unknown, maybeCb?: unknown) => {
  const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
  expect(typeof cb).toBe('function');
  (cb as (err: null, result: { stdout: string; stderr: string }) => void)(null, { stdout: `${cmd} ${args.join(' ')} ${stdout}`.trim(), stderr });
  return {};
};

describe('audit and server commands', () => {
  it('writes audit events as json lines', async () => {
    await writeAuditEvent({ type: 'task', timestamp: 'now', message: 'hello', chatId: 1 });
    const line = (await readFile(getAuditLogPath(), 'utf8')).trim();
    expect(JSON.parse(line)).toMatchObject({ type: 'task', message: 'hello', chatId: 1 });
  });

  it('returns status from system commands', async () => {
    execFileMock.mockImplementation(callbackSuccess('ok'));
    const status = await getServerStatus();
    expect(status).toContain('Uptime:');
    expect(status).toContain('Memory:');
    expect(status).toContain('Disk:');
    expect(execFileMock).toHaveBeenCalledWith('uptime', [], expect.any(Function));
  });

  it('reads allowed service and file logs, blocks others, and restarts services', async () => {
    const config = parseConfig(configInput);
    execFileMock.mockImplementation(callbackSuccess('service log'));
    await writeFile(join(tempDir, 'app.log'), Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n'));

    expect(await readAllowedLogs(config, 'demo.service')).toContain('journalctl -u demo.service');
    expect(await readAllowedLogs(config, config.server.logFiles[0])).toContain('line 99');
    await expect(readAllowedLogs(config, 'blocked')).rejects.toThrow('Log is not allowed');
    expect(await restartAllowedService(config, 'demo.service')).toContain('systemctl restart demo.service');
    await expect(restartAllowedService(config, 'blocked')).rejects.toThrow('Service is not allowed');
  });
});

describe('server tools', () => {
  it('runs bash, writes files and edits exact matches', async () => {
    execMock.mockImplementation((command: string, options: unknown, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout: `ran ${command}`, stderr: '' });
      return {};
    });
    const [bash, write, edit] = createServerTools({ rootPath: tempDir }) as any[];
    expect(await bash.execute('1', { command: 'pwd' })).toMatchObject({ content: [{ text: 'ran pwd' }] });
    expect(execMock).toHaveBeenCalledWith('pwd', expect.objectContaining({ cwd: tempDir }), expect.any(Function));

    expect(await write.execute('2', { path: 'nested/file.txt', content: 'hello' })).toMatchObject({ content: [{ text: expect.stringContaining('nested/file.txt') }] });
    expect(await readFile(join(tempDir, 'nested/file.txt'), 'utf8')).toBe('hello');
    expect(await edit.execute('3', { path: 'nested/file.txt', oldText: 'hello', newText: 'bye' })).toMatchObject({ content: [{ text: expect.stringContaining('Edited') }] });
    expect(await readFile(join(tempDir, 'nested/file.txt'), 'utf8')).toBe('bye');
    expect(await edit.execute('4', { path: 'nested/file.txt', oldText: 'missing', newText: 'x' })).toMatchObject({ content: [{ text: 'Old text was not found exactly once.' }] });
    await writeFile(join(tempDir, 'nested/file.txt'), 'aa aa');
    expect(await edit.execute('5', { path: 'nested/file.txt', oldText: 'aa', newText: 'x' })).toMatchObject({ content: [{ text: 'Old text appears more than once. Edit was blocked.' }] });
  });
});

describe('voice helpers', () => {
  it('downloads telegram files and rejects bad responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })));
    await expect(downloadTelegramFile(new URL('https://example.test/file'))).resolves.toEqual(Buffer.from([1, 2, 3]));

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' })));
    await expect(downloadTelegramFile(new URL('https://example.test/file'))).rejects.toThrow('404 Not Found');
  });

  it('transcribes using transcript files, stdout fallback, empty rejection, and cleanup', async () => {
    const voiceConfig = { whisperCommand: 'whisper', whisperModel: 'model', ffmpegCommand: 'ffmpeg', extraArgs: ['--x'], timeoutMs: 1000 };

    execFileMock.mockImplementation((cmd: string, args: string[], options: unknown, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      if (cmd === 'whisper') {
        const outIndex = args.indexOf('-of');
        writeFileSync(`${args[outIndex + 1]}.txt`, 'from file');
      }
      cb(null, { stdout: 'from stdout', stderr: '' });
      return {};
    });
    expect(await transcribeVoiceBuffer(Buffer.from('voice'), voiceConfig)).toBe('from file');

    execFileMock.mockImplementation((_cmd: string, _args: string[], _options: unknown, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout: 'fallback stdout', stderr: '' });
      return {};
    });
    expect(await transcribeVoiceBuffer(Buffer.from('voice'), voiceConfig)).toBe('fallback stdout');

    execFileMock.mockImplementation((_cmd: string, _args: string[], _options: unknown, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout: '   ', stderr: '' });
      return {};
    });
    await expect(transcribeVoiceBuffer(Buffer.from('voice'), voiceConfig)).rejects.toThrow('empty transcript');
  });
});
