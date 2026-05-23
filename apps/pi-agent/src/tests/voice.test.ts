import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

import type { VoiceConfig } from '../config';
import { downloadTelegramFile, transcribeVoiceBuffer } from '../voice';

const execFileMock = vi.mocked(execFile);

const voiceConfig: VoiceConfig = {
  whisperCommand: 'whisper',
  whisperModel: 'model.bin',
  ffmpegCommand: 'ffmpeg',
  extraArgs: ['--no-prints'],
  timeoutMs: 1000,
};

beforeEach(() => {
  execFileMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloadTelegramFile', () => {
  it('downloads response bytes into a Buffer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })));
    await expect(downloadTelegramFile(new URL('https://example.test/file'))).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it('throws on failed downloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' })));
    await expect(downloadTelegramFile(new URL('https://example.test/file'))).rejects.toThrow('Telegram file download failed: 404 Not Found');
  });
});

describe('transcribeVoiceBuffer', () => {
  it('converts audio, reads transcript file, and cleans temp files', async () => {
    let tempDir = '';
    execFileMock.mockImplementation(((command: string, args: readonly string[], _options: unknown, callback: (error: null, result: { stdout: string; stderr: string }) => void) => {
      if (command === 'whisper') {
        const outputIndex = (args as string[]).indexOf('-of');
        tempDir = String(args[outputIndex + 1]).replace(/\/transcript$/, '');
        void writeFile(`${args[outputIndex + 1]}.txt`, 'from file');
      }
      callback(null, { stdout: 'from stdout', stderr: '' });
      return {} as never;
    }) as never);

    await expect(transcribeVoiceBuffer(Buffer.from('voice'), voiceConfig)).resolves.toBe('from file');
    expect(execFileMock).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining(['-ar', '16000']), expect.objectContaining({ timeout: 1000, maxBuffer: expect.any(Number) }), expect.any(Function));
    expect(execFileMock).toHaveBeenCalledWith('whisper', expect.arrayContaining(['-m', 'model.bin', '-otxt', '--no-prints']), expect.any(Object), expect.any(Function));
    expect(existsSync(tempDir)).toBe(false);
  });

  it('falls back to stdout and rejects empty transcripts', async () => {
    execFileMock.mockImplementation(((_command: string, _args: readonly string[], _options: unknown, callback: (error: null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: 'stdout transcript', stderr: '' });
      return {} as never;
    }) as never);
    await expect(transcribeVoiceBuffer(Buffer.from('voice'), voiceConfig)).resolves.toBe('stdout transcript');

    execFileMock.mockImplementation(((_command: string, _args: readonly string[], _options: unknown, callback: (error: null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: '   ', stderr: '' });
      return {} as never;
    }) as never);
    await expect(transcribeVoiceBuffer(Buffer.from('voice'), voiceConfig)).rejects.toThrow('Whisper returned an empty transcript');
  });
});
