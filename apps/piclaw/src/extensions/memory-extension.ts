import { clearWarnedUsageLevels } from '../agent/usage';
import type { PiclawExtensionAPI } from '../core/extension-api';
import {
  clearMarkdownMemory,
  clearSessionSummary,
  clearShortMemory,
  readMarkdownMemory,
  readSessionSummary,
  remember,
} from '../memory/memory';
import { telegramHtmlFromMarkdown } from '../messages/format';
import { truncateText } from '../messages/text';

const rootMemoryId = 'server-root';

type ReplyContext = {
  reply?: (text: string, extra?: unknown) => Promise<unknown> | unknown;
};

const asReplyContext = (context: unknown): ReplyContext =>
  typeof context === 'object' && context !== null ? context as ReplyContext : {};

const reply = async (context: unknown, text: string, extra?: unknown): Promise<boolean> => {
  const replyContext = asReplyContext(context);
  if (typeof replyContext.reply !== 'function') {
    return false;
  }

  if (extra === undefined) {
    await replyContext.reply(text);
    return true;
  }

  await replyContext.reply(text, extra);
  return true;
};

const replyHtml = async (context: unknown, html: string): Promise<boolean> =>
  reply(context, html, { parse_mode: 'HTML' });

export const registerMemoryExtension = (piclaw: PiclawExtensionAPI): void => {
  piclaw.registerCommand({
    name: 'remember',
    description: 'Save long-term memory.',
    handler: async (input) => {
      const payload = input.args.trim();
      if (payload.length === 0) {
        return 'Use /remember <text>';
      }

      await remember(payload);
      return 'Saved to memory.';
    },
  });

  piclaw.registerCommand({
    name: 'forget',
    description: 'Clear saved long-term memory.',
    handler: async () => {
      await clearMarkdownMemory();
      return 'Forgot saved long-term memory.';
    },
  });

  piclaw.registerCommand({
    name: 'memory',
    description: 'Show saved long-term memory and compact session memory.',
    handler: async (input) => {
      const [memory, summary] = await Promise.all([readMarkdownMemory(), readSessionSummary()]);
      const text = ['Long memory:', memory || '(empty)', '', 'Session compact memory:', summary || '(empty)'].join('\n');
      const html = telegramHtmlFromMarkdown(truncateText(text, 3500));
      if (await replyHtml(input.context, html)) {
        return;
      }
      return truncateText(text, 3500);
    },
  });

  piclaw.registerCommand({
    name: 'new',
    description: 'Start a new short context while keeping long-term memory.',
    handler: async (input) => {
      if (input.conversationId === undefined) {
        return 'Cannot start new context without chat.';
      }

      const conversationKey = Number(input.conversationId);
      if (!Number.isFinite(conversationKey)) {
        return 'Cannot start new context without numeric chat.';
      }

      await Promise.all([
        clearShortMemory(conversationKey, rootMemoryId),
        clearSessionSummary(),
        clearWarnedUsageLevels(conversationKey),
      ]);
      return 'Started new context. Memory was kept.';
    },
  });
};

export default registerMemoryExtension;
