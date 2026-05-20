import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const getAppDir = (): string => join(process.cwd(), 'data', 'telegram-pi-agent');

export const getPiAgentDir = (): string => join(process.cwd(), 'data', 'pi');

export const getMemoryDir = (): string => join(getAppDir(), 'memory');

export const getShortMemoryPath = (chatId: number, workspaceId: string): string =>
  join(getAppDir(), 'short-memory', `${chatId}-${workspaceId}.json`);

export const getGlobalMemoryPath = (): string => join(getMemoryDir(), 'global.md');

export const getWorkspaceMemoryPath = (workspaceId: string): string =>
  join(getMemoryDir(), 'workspaces', `${workspaceId}.md`);

export const getAuditLogPath = (): string => join(getAppDir(), 'audit.jsonl');

export const ensureParentDir = async (path: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
};

export const ensureAppDirs = async (): Promise<void> => {
  await mkdir(join(getMemoryDir(), 'workspaces'), { recursive: true });
  await mkdir(join(getAppDir(), 'short-memory'), { recursive: true });
  await mkdir(join(getPiAgentDir(), 'skills'), { recursive: true });
  await mkdir(join(getPiAgentDir(), 'sessions'), { recursive: true });
  await mkdir(join(getPiAgentDir(), 'prompts'), { recursive: true });
  await mkdir(join(getPiAgentDir(), 'themes'), { recursive: true });
  await mkdir(join(getPiAgentDir(), 'extensions'), { recursive: true });
};
