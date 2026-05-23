import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getConfigPath, loadConfig, parseConfig } from './config';

const originalCwd = process.cwd();
let tempDir: string;

const baseConfig = {
  telegram: { allowedUserIds: [1, 2] },
  rootPath: '.',
  server: { services: ['svc'], logFiles: ['logs/app.log'] },
};

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'config-test-'));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('config', () => {
  it('returns the startup config path', () => {
    expect(getConfigPath()).toContain(join('config', 'pi-agent.json'));
  });

  it('parses defaults and resolves paths', () => {
    const config = parseConfig(baseConfig);
    expect(config.rootPath).toBe(resolve(tempDir));
    expect(config.server.logFiles).toEqual([resolve(tempDir, 'logs/app.log')]);
    expect(config.voice).toMatchObject({ whisperCommand: 'whisper-cli', ffmpegCommand: 'ffmpeg', extraArgs: ['--no-prints'], timeoutMs: 120_000 });
    expect(config.voice.whisperModel).toBe(resolve(tempDir, 'data/voice/ggml-base.en.bin'));
  });

  it('parses custom voice settings', () => {
    const config = parseConfig({
      ...baseConfig,
      voice: { whisperCommand: 'whisper', whisperModel: 'model.bin', ffmpegCommand: 'avconv', extraArgs: ['--fast'], timeoutMs: 5 },
    });
    expect(config.voice).toEqual({ whisperCommand: 'whisper', whisperModel: resolve(tempDir, 'model.bin'), ffmpegCommand: 'avconv', extraArgs: ['--fast'], timeoutMs: 5 });
  });

  it('loads json config from disk', async () => {
    await writeFile(getConfigPath(), JSON.stringify(baseConfig));
    await expect(loadConfig()).resolves.toMatchObject({ telegram: { allowedUserIds: [1, 2] } });
  });

  it('rejects invalid config shapes', () => {
    expect(() => parseConfig(null)).toThrow('Config must be an object');
    expect(() => parseConfig({ ...baseConfig, telegram: {} })).toThrow('telegram.allowedUserIds');
    expect(() => parseConfig({ ...baseConfig, rootPath: 1 })).toThrow('rootPath');
    expect(() => parseConfig({ ...baseConfig, server: { services: [1], logFiles: [] } })).toThrow('server.services');
    expect(() => parseConfig({ ...baseConfig, voice: 1 })).toThrow('voice must be an object');
    expect(() => parseConfig({ ...baseConfig, voice: { whisperCommand: 1 } })).toThrow('whisperCommand');
    expect(() => parseConfig({ ...baseConfig, voice: { whisperModel: 1 } })).toThrow('whisperModel');
    expect(() => parseConfig({ ...baseConfig, voice: { ffmpegCommand: 1 } })).toThrow('ffmpegCommand');
    expect(() => parseConfig({ ...baseConfig, voice: { extraArgs: [1] } })).toThrow('extraArgs');
    expect(() => parseConfig({ ...baseConfig, voice: { timeoutMs: 'bad' } })).toThrow('timeoutMs');
  });
});
