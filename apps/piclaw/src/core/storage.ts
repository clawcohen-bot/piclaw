import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type ConversationKey = number | string;

const formatStorageKey = (key: ConversationKey): string =>
  typeof key === 'number' ? String(key) : encodeURIComponent(key);

export const getAppDir = (): string => join(process.cwd(), 'data', 'piclaw');

export const getPiSdkDir = (): string => join(process.cwd(), 'data', 'pi');

export const getObsidianVaultDir = (): string => join(process.cwd(), 'data', 'obsidian-vault');

export const getMemoryPath = (): string => join(getAppDir(), 'memory.md');

export const getSessionSummaryPath = (): string => join(getAppDir(), 'summary.md');

export const getShortMemoryPath = (conversationKey: ConversationKey, rootId: string): string =>
  join(getAppDir(), 'short-memory', `${formatStorageKey(conversationKey)}-${formatStorageKey(rootId)}.json`);

export const getAuditLogPath = (): string => join(getAppDir(), 'audit.jsonl');

export const getChatModePath = (conversationKey: ConversationKey): string => join(getAppDir(), 'modes', `${formatStorageKey(conversationKey)}.txt`);

export const ensureParentDir = async (path: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
};

export const ensureAppDirs = async (): Promise<void> => {
  await mkdir(getAppDir(), { recursive: true });
  await mkdir(join(getAppDir(), 'short-memory'), { recursive: true });
  await mkdir(join(getAppDir(), 'modes'), { recursive: true });
  await mkdir(join(getAppDir(), 'models'), { recursive: true });
  await mkdir(join(getAppDir(), 'usage-warnings'), { recursive: true });
  await mkdir(join(getPiSdkDir(), 'skills'), { recursive: true });
  await mkdir(join(getPiSdkDir(), 'sessions'), { recursive: true });
  await mkdir(join(getPiSdkDir(), 'prompts'), { recursive: true });
  await mkdir(join(getPiSdkDir(), 'themes'), { recursive: true });
  await mkdir(join(getPiSdkDir(), 'extensions'), { recursive: true });
  await mkdir(getObsidianVaultDir(), { recursive: true });
};
