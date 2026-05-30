import { readFile, writeFile } from 'node:fs/promises';

import { ensureParentDir, getChatModePath, type ConversationKey } from '../core/storage';

export type AgentMode = 'agent' | 'ask';

export const defaultAgentMode: AgentMode = 'agent';

export const isAgentMode = (value: string): value is AgentMode => value === 'agent' || value === 'ask';

export const readAgentMode = async (conversationKey: ConversationKey): Promise<AgentMode> => {
  try {
    const value = (await readFile(getChatModePath(conversationKey), 'utf8')).trim();
    return isAgentMode(value) ? value : defaultAgentMode;
  } catch {
    return defaultAgentMode;
  }
};

export const writeAgentMode = async (conversationKey: ConversationKey, mode: AgentMode): Promise<void> => {
  const path = getChatModePath(conversationKey);
  await ensureParentDir(path);
  await writeFile(path, `${mode}\n`, 'utf8');
};

export const formatAgentMode = (mode: AgentMode): string => {
  if (mode === 'ask') {
    return 'ask (read-only)';
  }

  return 'agent (full access)';
};
