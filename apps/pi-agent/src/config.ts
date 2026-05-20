import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveWorkspacePath } from './path-safety';

export type TelegramConfig = {
  allowedUserIds: number[];
};

export type ServerConfig = {
  services: string[];
  logFiles: string[];
};

export type VoiceConfig = {
  whisperCommand: string;
  whisperModel: string;
  ffmpegCommand: string;
  extraArgs: string[];
  timeoutMs: number;
};

export type AppConfig = {
  telegram: TelegramConfig;
  rootPath: string;
  server: ServerConfig;
  voice: VoiceConfig;
};

const defaultConfigPath = join(process.cwd(), 'config', 'pi-agent.json');

export const getConfigPath = (): string => defaultConfigPath;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number');

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const parseConfig = (value: unknown): AppConfig => {
  if (!isRecord(value)) {
    throw new Error('Config must be an object');
  }

  const { telegram, rootPath, server, voice } = value;

  if (!isRecord(telegram) || !isNumberArray(telegram.allowedUserIds)) {
    throw new Error('Config telegram.allowedUserIds must be a number array');
  }

  if (typeof rootPath !== 'string') {
    throw new Error('Config rootPath must be a string');
  }

  const resolvedRootPath = resolveWorkspacePath(process.cwd(), rootPath);

  if (resolvedRootPath === undefined) {
    throw new Error('Config rootPath must be inside this repo');
  }

  if (!isRecord(server) || !isStringArray(server.services) || !isStringArray(server.logFiles)) {
    throw new Error('Config server.services and server.logFiles must be string arrays');
  }

  const resolvedLogFiles: string[] = [];

  for (const logFile of server.logFiles) {
    const resolvedLogFile = resolveWorkspacePath(process.cwd(), logFile);

    if (resolvedLogFile === undefined) {
      throw new Error('Config server.logFiles must be inside this repo');
    }

    resolvedLogFiles.push(resolvedLogFile);
  }

  const voiceConfig: VoiceConfig = {
    whisperCommand: 'whisper-cli',
    whisperModel: join(process.cwd(), 'data', 'voice', 'ggml-base.en.bin'),
    ffmpegCommand: 'ffmpeg',
    extraArgs: ['--no-prints'],
    timeoutMs: 120_000,
  };

  if (voice !== undefined) {
    if (!isRecord(voice)) {
      throw new Error('Config voice must be an object');
    }

    if (voice.whisperCommand !== undefined) {
      if (typeof voice.whisperCommand !== 'string') {
        throw new Error('Config voice.whisperCommand must be a string');
      }
      voiceConfig.whisperCommand = voice.whisperCommand;
    }

    if (voice.whisperModel !== undefined) {
      if (typeof voice.whisperModel !== 'string') {
        throw new Error('Config voice.whisperModel must be a string');
      }
      voiceConfig.whisperModel = voice.whisperModel;
    }

    if (voice.ffmpegCommand !== undefined) {
      if (typeof voice.ffmpegCommand !== 'string') {
        throw new Error('Config voice.ffmpegCommand must be a string');
      }
      voiceConfig.ffmpegCommand = voice.ffmpegCommand;
    }

    if (voice.extraArgs !== undefined) {
      if (!isStringArray(voice.extraArgs)) {
        throw new Error('Config voice.extraArgs must be a string array');
      }
      voiceConfig.extraArgs = voice.extraArgs;
    }

    if (voice.timeoutMs !== undefined) {
      if (typeof voice.timeoutMs !== 'number') {
        throw new Error('Config voice.timeoutMs must be a number');
      }
      voiceConfig.timeoutMs = voice.timeoutMs;
    }
  }

  const resolvedVoiceModel = resolveWorkspacePath(process.cwd(), voiceConfig.whisperModel);

  if (resolvedVoiceModel === undefined) {
    throw new Error('Config voice.whisperModel must be inside this repo');
  }

  return {
    telegram: {
      allowedUserIds: telegram.allowedUserIds,
    },
    rootPath: resolvedRootPath,
    server: {
      services: server.services,
      logFiles: resolvedLogFiles,
    },
    voice: {
      ...voiceConfig,
      whisperModel: resolvedVoiceModel,
    },
  };
};

export const loadConfig = async (): Promise<AppConfig> => {
  const configPath = getConfigPath();
  const content = await readFile(configPath, 'utf8');
  return parseConfig(JSON.parse(content));
};
