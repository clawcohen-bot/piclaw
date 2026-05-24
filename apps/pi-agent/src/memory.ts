import { appendFile, readFile, writeFile } from 'node:fs/promises';

import { ensureParentDir, getMemoryPath, getSessionSummaryPath, getShortMemoryPath, type ConversationKey } from './storage';

export type ShortMemoryMessage = {
  role: 'user' | 'bot';
  text: string;
  timestamp: string;
  rootId: string;
  messageId: number | string;
};

const shortMemoryLimit = 30;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isShortMemoryMessage = (value: unknown): value is ShortMemoryMessage => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.role === 'user' || value.role === 'bot') &&
    typeof value.text === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.rootId === 'string' &&
    (typeof value.messageId === 'number' || typeof value.messageId === 'string')
  );
};

export const readShortMemory = async (conversationKey: ConversationKey, rootId: string): Promise<ShortMemoryMessage[]> => {
  try {
    const content = await readFile(getShortMemoryPath(conversationKey, rootId), 'utf8');
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isShortMemoryMessage);
  } catch {
    return [];
  }
};

export const addShortMemoryMessage = async (
  conversationKey: ConversationKey,
  message: ShortMemoryMessage,
): Promise<void> => {
  const path = getShortMemoryPath(conversationKey, message.rootId);
  const current = await readShortMemory(conversationKey, message.rootId);
  const next = [...current, message].slice(-shortMemoryLimit);

  await ensureParentDir(path);
  await writeFile(path, JSON.stringify(next, null, 2), 'utf8');
};


export const writeShortMemory = async (
  conversationKey: ConversationKey,
  rootId: string,
  messages: ShortMemoryMessage[],
): Promise<void> => {
  const path = getShortMemoryPath(conversationKey, rootId);
  await ensureParentDir(path);
  await writeFile(path, JSON.stringify(messages.slice(-shortMemoryLimit), null, 2), 'utf8');
};

export const clearShortMemory = async (conversationKey: ConversationKey, rootId: string): Promise<void> => {
  const path = getShortMemoryPath(conversationKey, rootId);
  await ensureParentDir(path);
  await writeFile(path, '[]\n', 'utf8');
};

export const readMarkdownMemory = async (): Promise<string> => {
  return readMemoryFile(getMemoryPath());
};

export const readSessionSummary = async (): Promise<string> => {
  return readMemoryFile(getSessionSummaryPath());
};

export const writeSessionSummary = async (summary: string): Promise<void> => {
  const path = getSessionSummaryPath();
  await ensureParentDir(path);
  await writeFile(path, summary.trim() === '' ? '' : `${summary.trim()}\n`, 'utf8');
};

export const clearSessionSummary = async (): Promise<void> => {
  await writeSessionSummary('');
};

export const writeMarkdownMemory = async (memory: string): Promise<void> => {
  const path = getMemoryPath();
  await ensureParentDir(path);
  await writeFile(path, memory.trim() === '' ? '' : `${memory.trim()}\n`, 'utf8');
};

export const clearMarkdownMemory = async (): Promise<void> => {
  await writeMarkdownMemory('');
};

export const remember = async (text: string): Promise<void> => {
  await appendMemory(getMemoryPath(), text);
};

const readMemoryFile = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
};

const appendMemory = async (path: string, text: string): Promise<void> => {
  const line = `- ${new Date().toISOString()}: ${text}\n`;
  await ensureParentDir(path);
  await appendFile(path, line, 'utf8');
};
