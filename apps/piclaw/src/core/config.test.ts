import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    expect(getConfigPath()).toContain(join('config', 'piclaw.json'));
  });

  it('parses defaults and resolves paths', () => {
    const cwd = process.cwd();
    const config = parseConfig(baseConfig);
    expect(config.telegram.enabled).toBe(true);
    expect(config.slack).toEqual({ enabled: false, allowedUserIds: [] });
    expect(config.devCli).toEqual({ enabled: false });
    expect(config.rootPath).toBe(resolve(cwd));
    expect(config.server.logFiles).toEqual([resolve(cwd, 'logs/app.log')]);
    expect(config.voice).toMatchObject({ whisperCommand: 'whisper-cli', ffmpegCommand: 'ffmpeg', extraArgs: ['--no-prints'], timeoutMs: 120_000 });
    expect(config.voice.whisperModel).toBe(resolve(cwd, 'data/voice/ggml-base.en.bin'));
    expect(config.extensions).toEqual([]);
    expect(config.packages).toEqual([]);
    expect(config.models).toEqual({ providers: {} });
  });

  it('parses custom voice and connector settings', () => {
    const config = parseConfig({
      ...baseConfig,
      telegram: { enabled: false, allowedUserIds: [1, 2] },
      slack: { enabled: true, allowedUserIds: ['U1'] },
      devCli: { enabled: true },
      voice: { whisperCommand: 'whisper', whisperModel: 'model.bin', ffmpegCommand: 'avconv', extraArgs: ['--fast'], timeoutMs: 5 },
      extensions: ['.piclaw/extensions'],
      packages: ['packages/wiki'],
      models: { default: 'openai/gpt-4.1-mini', providers: { local: { baseUrl: 'http://localhost' } } },
    });
    expect(config.telegram.enabled).toBe(false);
    expect(config.slack).toEqual({ enabled: true, allowedUserIds: ['U1'] });
    expect(config.devCli).toEqual({ enabled: true });
    expect(config.voice).toEqual({ whisperCommand: 'whisper', whisperModel: resolve(process.cwd(), 'model.bin'), ffmpegCommand: 'avconv', extraArgs: ['--fast'], timeoutMs: 5 });
    expect(config.extensions).toEqual([resolve(process.cwd(), '.piclaw/extensions')]);
    expect(config.packages).toEqual([resolve(process.cwd(), 'packages/wiki')]);
    expect(config.models).toEqual({ default: 'openai/gpt-4.1-mini', providers: { local: { baseUrl: 'http://localhost' } } });
  });

  it('loads json config from disk', async () => {
    await mkdir(join(tempDir, 'config'));
    await writeFile(getConfigPath(), JSON.stringify(baseConfig));
    await expect(loadConfig()).resolves.toMatchObject({ telegram: { allowedUserIds: [1, 2] } });
  });

  it('rejects invalid config shapes', () => {
    expect(() => parseConfig(null)).toThrow('Config must be an object');
    expect(() => parseConfig({ ...baseConfig, telegram: {} })).toThrow('telegram.allowedUserIds');
    expect(() => parseConfig({ ...baseConfig, telegram: { enabled: 'yes', allowedUserIds: [] } })).toThrow('telegram.enabled');
    expect(() => parseConfig({ ...baseConfig, slack: 1 })).toThrow('slack must be an object');
    expect(() => parseConfig({ ...baseConfig, slack: { enabled: 'yes' } })).toThrow('slack.enabled');
    expect(() => parseConfig({ ...baseConfig, slack: { allowedUserIds: [1] } })).toThrow('slack.allowedUserIds');
    expect(() => parseConfig({ ...baseConfig, devCli: 1 })).toThrow('devCli must be an object');
    expect(() => parseConfig({ ...baseConfig, devCli: { enabled: 'yes' } })).toThrow('devCli.enabled');
    expect(() => parseConfig({ ...baseConfig, rootPath: 1 })).toThrow('rootPath');
    expect(() => parseConfig({ ...baseConfig, server: { services: [1], logFiles: [] } })).toThrow('server.services');
    expect(() => parseConfig({ ...baseConfig, voice: 1 })).toThrow('voice must be an object');
    expect(() => parseConfig({ ...baseConfig, voice: { whisperCommand: 1 } })).toThrow('whisperCommand');
    expect(() => parseConfig({ ...baseConfig, voice: { whisperModel: 1 } })).toThrow('whisperModel');
    expect(() => parseConfig({ ...baseConfig, voice: { ffmpegCommand: 1 } })).toThrow('ffmpegCommand');
    expect(() => parseConfig({ ...baseConfig, voice: { extraArgs: [1] } })).toThrow('extraArgs');
    expect(() => parseConfig({ ...baseConfig, voice: { timeoutMs: 'bad' } })).toThrow('timeoutMs');
    expect(() => parseConfig({ ...baseConfig, extensions: [1] })).toThrow('extensions');
    expect(() => parseConfig({ ...baseConfig, packages: [1] })).toThrow('packages');
    expect(() => parseConfig({ ...baseConfig, models: 1 })).toThrow('models must be an object');
    expect(() => parseConfig({ ...baseConfig, models: { default: 1 } })).toThrow('models.default');
    expect(() => parseConfig({ ...baseConfig, models: { providers: [] } })).toThrow('models.providers');
  });
});
