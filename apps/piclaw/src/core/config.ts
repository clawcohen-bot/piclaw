import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveSystemPath } from './path';

export type TelegramConfig = {
  enabled: boolean;
  allowedUserIds: number[];
};

export type SlackConfig = {
  enabled: boolean;
  allowedUserIds: string[];
};

export type DevCliConfig = {
  enabled: boolean;
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
  slack: SlackConfig;
  devCli: DevCliConfig;
  rootPath: string;
  server: ServerConfig;
  voice: VoiceConfig;
};

export const getConfigPath = (): string => join(process.cwd(), 'config', 'piclaw.json');

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

  const { telegram, slack, devCli, rootPath, server, voice } = value;

  if (!isRecord(telegram) || !isNumberArray(telegram.allowedUserIds)) {
    throw new Error('Config telegram.allowedUserIds must be a number array');
  }

  const telegramEnabled = telegram.enabled === undefined ? true : telegram.enabled;
  if (typeof telegramEnabled !== 'boolean') {
    throw new Error('Config telegram.enabled must be a boolean');
  }

  const slackConfig = slack === undefined ? {} : slack;
  if (!isRecord(slackConfig)) {
    throw new Error('Config slack must be an object');
  }

  const slackEnabled = slackConfig.enabled === undefined ? false : slackConfig.enabled;
  if (typeof slackEnabled !== 'boolean') {
    throw new Error('Config slack.enabled must be a boolean');
  }

  const slackAllowedUserIds = slackConfig.allowedUserIds === undefined ? [] : slackConfig.allowedUserIds;
  if (!isStringArray(slackAllowedUserIds)) {
    throw new Error('Config slack.allowedUserIds must be a string array');
  }

  const devCliConfig = devCli === undefined ? {} : devCli;
  if (!isRecord(devCliConfig)) {
    throw new Error('Config devCli must be an object');
  }

  const devCliEnabled = devCliConfig.enabled === undefined ? false : devCliConfig.enabled;
  if (typeof devCliEnabled !== 'boolean') {
    throw new Error('Config devCli.enabled must be a boolean');
  }

  if (typeof rootPath !== 'string') {
    throw new Error('Config rootPath must be a string');
  }

  const resolvedRootPath = resolveSystemPath(process.cwd(), rootPath);

  if (!isRecord(server) || !isStringArray(server.services) || !isStringArray(server.logFiles)) {
    throw new Error('Config server.services and server.logFiles must be string arrays');
  }

  const resolvedLogFiles = server.logFiles.map((logFile) => resolveSystemPath(process.cwd(), logFile));

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

  const resolvedVoiceModel = resolveSystemPath(process.cwd(), voiceConfig.whisperModel);

  return {
    telegram: {
      enabled: telegramEnabled,
      allowedUserIds: telegram.allowedUserIds,
    },
    slack: {
      enabled: slackEnabled,
      allowedUserIds: slackAllowedUserIds,
    },
    devCli: {
      enabled: devCliEnabled,
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
