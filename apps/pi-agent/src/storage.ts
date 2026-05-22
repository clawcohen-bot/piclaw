import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const getAppDir = (): string => join(process.cwd(), 'data', 'pi-agent');

export const getPiAgentDir = (): string => join(process.cwd(), 'data', 'pi');

export const getMemoryDir = (): string => join(getAppDir(), 'memory');

export const getShortMemoryPath = (chatId: number, rootId: string): string =>
  join(getAppDir(), 'short-memory', `${chatId}-${rootId}.json`);

export const getGlobalMemoryPath = (): string => join(getMemoryDir(), 'global.md');

export const getRootMemoryPath = (rootId: string): string =>
  join(getMemoryDir(), 'roots', `${rootId}.md`);

export const getAuditLogPath = (): string => join(getAppDir(), 'audit.jsonl');

export const getChatModePath = (chatId: number): string => join(getAppDir(), 'modes', `${chatId}.txt`);

export const ensureParentDir = async (path: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
};

export const ensureAppDirs = async (): Promise<void> => {
  await mkdir(join(getMemoryDir(), 'roots'), { recursive: true });
  await mkdir(join(getAppDir(), 'short-memory'), { recursive: true });
  await mkdir(join(getAppDir(), 'modes'), { recursive: true });
  await mkdir(join(getAppDir(), 'models'), { recursive: true });
  await mkdir(join(getPiAgentDir(), 'skills'), { recursive: true });
  await mkdir(join(getPiAgentDir(), 'sessions'), { recursive: true });
  await mkdir(join(getPiAgentDir(), 'prompts'), { recursive: true });
  await mkdir(join(getPiAgentDir(), 'themes'), { recursive: true });
  await mkdir(join(getPiAgentDir(), 'extensions'), { recursive: true });
};
