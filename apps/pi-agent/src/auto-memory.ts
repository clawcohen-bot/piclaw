import { createAgentSession, ModelRegistry, SessionManager } from '@earendil-works/pi-coding-agent';

import type { ShortMemoryMessage } from './memory';
import { getPiAgentDir } from './storage';

export type AutoMemoryUpdateInput = {
  rootPath: string;
  model?: ReturnType<ModelRegistry['getAll']>[number];
  currentMemory: string;
  recentMessages: ShortMemoryMessage[];
  userText: string;
};

export type AutoMemoryUpdate = {
  memory: string;
  notification: string;
};

const extractJsonObject = (text: string): string | undefined => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }

  return text.slice(start, end + 1);
};

const isAutoMemoryUpdate = (value: unknown): value is AutoMemoryUpdate =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { memory?: unknown }).memory === 'string' &&
  typeof (value as { notification?: unknown }).notification === 'string';

export const parseAutoMemoryUpdate = (text: string): AutoMemoryUpdate | undefined => {
  const json = extractJsonObject(text);
  if (json === undefined) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(json);
    if (!isAutoMemoryUpdate(parsed)) {
      return undefined;
    }

    return {
      memory: parsed.memory.trim(),
      notification: parsed.notification.trim(),
    };
  } catch {
    return undefined;
  }
};

export const reviewTelegramMemory = async (input: AutoMemoryUpdateInput): Promise<AutoMemoryUpdate | undefined> => {
  const { session } = await createAgentSession({
    cwd: input.rootPath,
    agentDir: getPiAgentDir(),
    tools: [],
    model: input.model,
    customTools: [],
    sessionManager: SessionManager.inMemory(),
  });

  let output = '';
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      output += event.assistantMessageEvent.delta;
    }
  });

  const prompt = [
    'You maintain long-term memory for a Telegram coding assistant.',
    '',
    'Memory policy:',
    '- Save useful recurring facts, personal preferences, important decisions, and project/business context.',
    '- Save things the user explicitly asks to remember.',
    '- Do not save one-time instructions, temporary moods, or random small details unless useful later.',
    '- Never save secrets: passwords, API keys, tokens, private keys, recovery codes, or similar credentials.',
    '- Sensitive personal/business/legal/health/finance info may be saved only if clearly useful; keep it brief.',
    '- If the user asks to forget, delete, or change saved memory, update the memory accordingly.',
    '- Keep memory concise as plain markdown bullets. Preserve useful existing memory.',
    '- If memory changes, notification must be one short line like "Saved memory: prefers short answers." or "Updated memory: prefers short answers."',
    '- If no memory change is needed, return the same memory and an empty notification.',
    '',
    'Return JSON only with exactly this shape:',
    '{"memory":"<complete updated memory markdown>","notification":"<short notification or empty string>"}',
    '',
    'Current memory:',
    input.currentMemory || '(empty)',
    '',
    'Recent Telegram messages:',
    input.recentMessages.slice(-10).map((message) => `${message.role}: ${message.text}`).join('\n') || '(empty)',
    '',
    'Latest user message:',
    input.userText,
  ].join('\n');

  try {
    await session.prompt(prompt);
    await session.agent.waitForIdle();
    return parseAutoMemoryUpdate(output);
  } finally {
    unsubscribe();
    session.dispose();
  }
};
