import { createAgentRunner, type AgentRunnerCallbacks } from '../../agent/agent-runner';
import type { AppConfig } from '../../core/config';
import type { PiclawRuntime } from '../../core/runtime';
import { getErrorMessage } from '../../core/error';
import { registerAgentControlExtension } from '../../extensions/agent-control-extension';
import { registerAppControlExtension } from '../../extensions/app-control-extension';
import { telegramHtmlFromMarkdown } from '../../messages/format';
import { getCommandPayload, truncateText } from '../../messages/text';
import { getChatId } from './telegram-context';
import { getMessageId, getMessageText } from './telegram-text';
import { Context, Telegraf } from 'telegraf';

const typingIntervalMs = 4000;
const reloadExitCode = 75;

type TypingContext = {
  sendChatAction: (action: 'typing') => Promise<unknown>;
};

type TaskContext = Context & TypingContext;

const replyTelegramHtml = async (ctx: Context, text: string): Promise<void> => {
  await ctx.reply(text, { parse_mode: 'HTML' });
};

const getTelegramMessageId = (value: unknown): number | undefined => {
  if (typeof value !== 'object' || value === null || !('message_id' in value)) {
    return undefined;
  }

  const messageId = value.message_id;
  if (typeof messageId !== 'number') {
    return undefined;
  }

  return messageId;
};

const getTelegramCommandName = (text: string): string | undefined => {
  const match = /^\/([^@\s]+)(?:@\w+)?(?:\s|$)/.exec(text.trim());
  return match?.[1]?.toLowerCase();
};

const getCallbackQueryData = (ctx: Context): string | undefined => {
  const callbackQuery = ctx.callbackQuery;
  if (callbackQuery === undefined || !('data' in callbackQuery)) {
    return undefined;
  }

  return callbackQuery.data;
};

const startTypingIndicator = (ctx: TypingContext): (() => void) => {
  let stopped = false;

  const sendTyping = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    try {
      await ctx.sendChatAction('typing');
    } catch {
      // Ignore Telegram typing indicator failures.
    }
  };

  void sendTyping();
  const interval = setInterval(() => {
    void sendTyping();
  }, typingIntervalMs);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
};

export const registerTelegramRuntimeHandlers = (bot: Telegraf<Context>, config: AppConfig, runtime: PiclawRuntime): void => {
  const agentRunner = createAgentRunner(config);
  registerAgentControlExtension(runtime.api, agentRunner);
  registerAppControlExtension(runtime.api, {
    agentRunner,
    reload: () => {
      bot.stop('reload');
      process.exit(reloadExitCode);
    },
  });

  const createRunnerCallbacks = (ctx: TaskContext, chatId: number): AgentRunnerCallbacks => {
    const toolMessages = new Map<string, Promise<number | undefined>>();

    const deleteToolMessage = async (toolCallId: string): Promise<void> => {
      const messageIdPromise = toolMessages.get(toolCallId);
      if (messageIdPromise === undefined) {
        return;
      }

      toolMessages.delete(toolCallId);
      const toolMessageId = await messageIdPromise;
      if (toolMessageId === undefined) {
        return;
      }

      try {
        await ctx.telegram.deleteMessage(chatId, toolMessageId);
      } catch {
        // Ignore Telegram delete failures.
      }
    };

    return {
      sendReply: (text) => ctx.reply(text).then(() => undefined),
      sendFormattedReply: (text) => replyTelegramHtml(ctx, telegramHtmlFromMarkdown(text)),
      startTyping: () => startTypingIndicator(ctx),
      onToolStart: async (toolCallId, toolName) => {
        const messageIdPromise = ctx
          .reply(`Using ${toolName} tool...`)
          .then(getTelegramMessageId)
          .catch(() => undefined);
        toolMessages.set(toolCallId, messageIdPromise);
        await messageIdPromise;
      },
      onToolEnd: deleteToolMessage,
      onBusy: async (actionId) => {
        await ctx.reply('Bot is busy. What should I do?', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Queue', callback_data: `busy:queue:${actionId}` }],
              [{ text: 'Cancel current', callback_data: `busy:cancel:${actionId}` }],
              [{ text: 'Ignore', callback_data: `busy:ignore:${actionId}` }],
            ],
          },
        });
      },
      onQueuedStart: async () => {
        await ctx.reply('Starting queued task...');
      },
    };
  };

  const submitTask = async (ctx: TaskContext, chatId: number, messageId: number, text: string): Promise<void> => {
    await agentRunner.submitTask({
      conversationKey: chatId,
      messageId,
      text,
      callbacks: createRunnerCallbacks(ctx, chatId),
    });
  };

  bot.on('voice', async (ctx) => {
    const chatId = getChatId(ctx);
    const messageId = getMessageId(ctx);

    if (chatId === undefined || messageId === undefined) {
      await ctx.reply('Cannot run voice task without chat.');
      return;
    }

    const status = await ctx.reply('Transcribing voice...');

    try {
      const tool = runtime.tools.get('voice.transcribe-telegram-file');
      if (tool === undefined) {
        await ctx.reply('Voice package is not enabled. Enable packages/piclaw-voice to use voice messages.');
        return;
      }

      const result = await runtime.tools.call('voice.transcribe-telegram-file', {
        fileId: ctx.message.voice.file_id,
        getFileLink: (fileId: string) => ctx.telegram.getFileLink(fileId),
      });
      const transcript = typeof result === 'string' ? result : '';
      if (transcript.length === 0) {
        await ctx.reply('Voice transcription returned no text.');
        return;
      }
      await ctx.reply(truncateText(`Transcript:\n${transcript}`, 3500));
      await submitTask(ctx, chatId, messageId, transcript);
    } catch (error) {
      await ctx.reply(`Voice transcription failed: ${getErrorMessage(error)}`);
    } finally {
      const statusMessageId = getTelegramMessageId(status);
      if (statusMessageId !== undefined) {
        try {
          await ctx.telegram.deleteMessage(chatId, statusMessageId);
        } catch {
          // Ignore Telegram delete failures.
        }
      }
    }
  });

  bot.on('callback_query', async (ctx) => {
    const data = getCallbackQueryData(ctx);
    if (data === undefined) {
      await ctx.answerCbQuery('Invalid action');
      return;
    }

    const chatId = getChatId(ctx);
    const result = await runtime.callbacks.handle({
      data,
      connector: 'telegram',
      conversationId: chatId === undefined ? undefined : String(chatId),
      userId: ctx.from?.id === undefined ? undefined : String(ctx.from.id),
      context: Object.assign(ctx, { data }),
    });

    if (!result.handled) {
      await ctx.answerCbQuery('Unknown action');
      return;
    }

    if (typeof result.result === 'string' && result.result.length > 0) {
      await ctx.reply(result.result);
    }
  });

  bot.on('text', async (ctx) => {
    const text = getMessageText(ctx);
    const messageId = getMessageId(ctx);
    const chatId = getChatId(ctx);

    if (text === undefined || messageId === undefined || chatId === undefined) {
      await ctx.reply('Cannot run task without text and chat.');
      return;
    }

    const authInputTool = runtime.tools.get('auth.handle-text-input');
    if (authInputTool !== undefined) {
      const result = await runtime.tools.call('auth.handle-text-input', {
        conversationId: String(chatId),
        messageId: String(messageId),
        text,
        context: ctx,
      }) as { handled?: boolean; deleteMessage?: boolean; response?: string };

      if (result.handled === true) {
        if (result.deleteMessage === true) {
          try {
            await ctx.telegram.deleteMessage(chatId, messageId);
          } catch {
            // Ignore Telegram delete failures.
          }
        }
        if (typeof result.response === 'string' && result.response.length > 0) {
          await ctx.reply(result.response);
        }
        return;
      }
    }

    if (text.startsWith('/')) {
      const commandName = getTelegramCommandName(text);
      const command = commandName === undefined ? undefined : runtime.commands.get(commandName);
      if (command === undefined) {
        await ctx.reply('Unknown command. Use /start for help.');
        return;
      }

      const result = await command.handler({
        name: command.name,
        args: getCommandPayload(text),
        rawText: text,
        conversationId: String(chatId),
        userId: ctx.from?.id === undefined ? undefined : String(ctx.from.id),
        context: Object.assign(ctx, { text }),
      });
      if (typeof result === 'string' && result.length > 0) {
        await ctx.reply(result);
      }
      return;
    }

    await submitTask(ctx, chatId, messageId, text);
  });
};
