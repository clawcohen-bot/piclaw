import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ModelRegistry } from '@earendil-works/pi-coding-agent';

import type { ShortMemoryMessage } from '../memory/memory';
import type { AgentMode } from './mode';
import { ensureParentDir, getAppDir, type ConversationKey } from '../core/storage';

type PiModel = ReturnType<ModelRegistry['getAll']>[number];

export type UsageContextInput = {
  rootPath: string;
  prompt: string;
  model?: PiModel;
  shortMemory: ShortMemoryMessage[];
  memory: string;
  sessionSummary: string;
  mode: AgentMode;
};

export type ContextUsage = {
  usedTokens: number;
  limitTokens?: number;
  remainingTokens?: number;
  percentUsed?: number;
};

const charsPerToken = 4;
const warningLevels = [70, 85, 95] as const;

const fallbackContextWindows: Record<string, number> = {
  'openai/gpt-4o': 128000,
  'openai/gpt-4o-mini': 128000,
  'openai/gpt-4.1': 1047576,
  'openai/gpt-4.1-mini': 1047576,
  'openai/gpt-4.1-nano': 1047576,
  'openai/o3': 200000,
  'openai/o3-mini': 200000,
  'openai/o4-mini': 200000,
  'anthropic/claude-3-5-sonnet-latest': 200000,
  'anthropic/claude-3-7-sonnet-latest': 200000,
  'anthropic/claude-sonnet-4-20250514': 200000,
  'anthropic/claude-opus-4-20250514': 200000,
  'google/gemini-1.5-pro': 2097152,
  'google/gemini-1.5-flash': 1048576,
  'google/gemini-2.0-flash': 1048576,
  'google/gemini-2.5-flash': 1048576,
  'google/gemini-2.5-pro': 1048576,
};

export const estimateTokens = (text: string): number => Math.ceil(text.length / charsPerToken);

export const buildPiTaskContext = (input: UsageContextInput): string =>
  [
    'Piclaw context',
    '',
    `Root path: ${input.rootPath}`,
    `Mode: ${input.mode}`,
    `Model: ${input.model === undefined ? 'Pi default' : `${input.model.provider}/${input.model.id}`}`,
    '',
    'Memory:',
    input.memory || '(empty)',
    '',
    'Session summary:',
    input.sessionSummary || '(empty)',
    '',
    'Last Telegram messages:',
    input.shortMemory.slice(-15).map((message) => `${message.role}: ${message.text}`).join('\n') || '(empty)',
    '',
    'User task:',
    input.prompt,
    '',
    'Reply style:',
    '- Final answer goes to Telegram.',
    '- Use short, plain text.',
    '- Prefer simple bullets when helpful.',
    '- Avoid Markdown headings, tables, and decorative formatting.',
    '- Do not start lines with #, ##, or similar heading syntax.',
    '',
    'Important tool rules:',
    '- For reading/searching files, use normal read/grep/find/ls tools.',
    ...(input.mode === 'ask'
      ? [
          '- Ask mode is read-only. You may inspect files and answer only.',
          '- Do not run shell commands, write files, or edit files.',
          '- If changes are needed, explain what you would change instead of doing it.',
        ]
      : [
          '- Agent mode has full access.',
          '- For shell commands, use server_bash.',
          '- For file writes, use server_write_file.',
          '- For exact text edits, use server_edit_replace.',
          '- rootPath is only the starting/default directory. It is not a sandbox.',
          '- Piclaw has full system access by default. Use absolute paths when needed.',
        ]),
  ].join('\n');

export const getModelContextLimit = (model?: PiModel): number | undefined => {
  if (typeof model?.contextWindow === 'number' && Number.isFinite(model.contextWindow) && model.contextWindow > 0) {
    return model.contextWindow;
  }

  if (model === undefined) {
    return undefined;
  }

  return fallbackContextWindows[`${model.provider}/${model.id}`];
};

export const calculateContextUsage = (context: string, model?: PiModel): ContextUsage => {
  const usedTokens = estimateTokens(context);
  const limitTokens = getModelContextLimit(model);
  if (limitTokens === undefined) {
    return { usedTokens };
  }

  return {
    usedTokens,
    limitTokens,
    remainingTokens: Math.max(0, limitTokens - usedTokens),
    percentUsed: Math.min(100, Math.ceil((usedTokens / limitTokens) * 100)),
  };
};

const formatNumber = (value: number): string => new Intl.NumberFormat('en-US').format(value);

const formatUsageModel = (model?: PiModel): string => (model === undefined ? 'Pi default' : `${model.provider}/${model.id}`);

export const formatContextUsage = (usage: ContextUsage, model?: PiModel): string => {
  const lines = ['Estimated context usage:', `- Model: ${formatUsageModel(model)}`, `- Used: ${formatNumber(usage.usedTokens)} tokens`];
  if (usage.limitTokens === undefined) {
    lines.push('- Limit: context limit unknown');
    return lines.join('\n');
  }

  lines.push(
    `- Limit: ${formatNumber(usage.limitTokens)} tokens`,
    `- Remaining: ${formatNumber(usage.remainingTokens ?? 0)} tokens`,
    `- Used: ${usage.percentUsed ?? 0}%`,
  );
  return lines.join('\n');
};

export const getUsageWarningLevel = (usage: ContextUsage): number | undefined => {
  if (usage.percentUsed === undefined) {
    return undefined;
  }

  return [...warningLevels].reverse().find((level) => usage.percentUsed !== undefined && usage.percentUsed >= level);
};

export const formatContextWarning = (usage: ContextUsage, level: number): string =>
  `Context warning: estimated ${usage.percentUsed ?? level}% used. Use /new to start fresh if replies get worse.`;

const formatStorageKey = (key: ConversationKey): string =>
  typeof key === 'number' ? String(key) : encodeURIComponent(key);

export const getUsageWarningsPath = (conversationKey: ConversationKey): string => join(getAppDir(), 'usage-warnings', `${formatStorageKey(conversationKey)}.json`);

export const readWarnedUsageLevels = async (conversationKey: ConversationKey): Promise<number[]> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(getUsageWarningsPath(conversationKey), 'utf8'));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is number => typeof value === 'number' && warningLevels.includes(value as (typeof warningLevels)[number]));
  } catch {
    return [];
  }
};

export const writeWarnedUsageLevels = async (conversationKey: ConversationKey, levels: number[]): Promise<void> => {
  const unique = [...new Set(levels)].sort((a, b) => a - b);
  const path = getUsageWarningsPath(conversationKey);
  await ensureParentDir(path);
  await writeFile(path, `${JSON.stringify(unique, null, 2)}\n`, 'utf8');
};

export const clearWarnedUsageLevels = async (conversationKey: ConversationKey): Promise<void> => {
  await writeWarnedUsageLevels(conversationKey, []);
};
