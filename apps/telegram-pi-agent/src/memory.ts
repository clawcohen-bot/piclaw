import { appendFile, readFile, writeFile } from 'node:fs/promises';

import { ensureParentDir, getGlobalMemoryPath, getShortMemoryPath, getWorkspaceMemoryPath } from './storage';

export type ShortMemoryMessage = {
  role: 'user' | 'bot';
  text: string;
  timestamp: string;
  workspaceId: string;
  messageId: number;
};

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
    typeof value.workspaceId === 'string' &&
    typeof value.messageId === 'number'
  );
};

export const readShortMemory = async (chatId: number, workspaceId: string): Promise<ShortMemoryMessage[]> => {
  try {
    const content = await readFile(getShortMemoryPath(chatId, workspaceId), 'utf8');
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
  chatId: number,
  message: ShortMemoryMessage,
): Promise<void> => {
  const path = getShortMemoryPath(chatId, message.workspaceId);
  const current = await readShortMemory(chatId, message.workspaceId);
  const next = [...current, message].slice(-15);

  await ensureParentDir(path);
  await writeFile(path, JSON.stringify(next, null, 2), 'utf8');
};

export const clearShortMemory = async (chatId: number, workspaceId: string): Promise<void> => {
  const path = getShortMemoryPath(chatId, workspaceId);
  await ensureParentDir(path);
  await writeFile(path, '[]\n', 'utf8');
};

export const readMarkdownMemory = async (workspaceId: string): Promise<{ global: string; workspace: string }> => {
  const global = await readMemoryFile(getGlobalMemoryPath());
  const workspace = await readMemoryFile(getWorkspaceMemoryPath(workspaceId));
  return { global, workspace };
};

export const rememberGlobal = async (text: string): Promise<void> => {
  await appendMemory(getGlobalMemoryPath(), text);
};

export const rememberWorkspace = async (workspaceId: string, text: string): Promise<void> => {
  await appendMemory(getWorkspaceMemoryPath(workspaceId), text);
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
