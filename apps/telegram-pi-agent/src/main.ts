import { createAuthMiddleware } from './auth';
import { helpText } from './commands';
import { getConfigPath, loadConfig } from './config';
import { getErrorMessage } from './error';
import { codeBlock } from './format';
import {
  addShortMemoryMessage,
  clearShortMemory,
  readMarkdownMemory,
  readShortMemory,
  rememberGlobal,
  rememberWorkspace,
} from './memory';
import { runPiTask } from './pi-task';
import { formatServices, getServerStatus, readAllowedLogs, restartAllowedService } from './server';
import { ensureAppDirs } from './storage';
import { createTaskState, isBusy, popQueuedTask, queueTask } from './task-state';
import { getChatId } from './telegram-context';
import { getMessageId, getMessageText } from './telegram-text';
import { getCommandPayload, truncateText } from './text';
import { downloadTelegramFile, transcribeVoiceBuffer } from './voice';
import { Context, Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;
const rootMemoryId = 'server-root';

const typingIntervalMs = 4000;
const reloadExitDelayMs = 500;

type TypingContext = {
  sendChatAction: (action: 'typing') => Promise<unknown>;
};

type TaskContext = Context & TypingContext;

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

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN');
}

const main = async (): Promise<void> => {
  await ensureAppDirs();

  const config = await loadConfig();
  const bot = new Telegraf(token);
  const taskState = createTaskState();
  const pendingBusyTasks = new Map<string, string>();

  bot.use(createAuthMiddleware(config));

  bot.start(async (ctx) => {
    await ctx.reply(`${helpText}\n\nRoot: ${config.rootPath}\nConfig: ${getConfigPath()}`);
  });

  bot.command('status', async (ctx) => {
    await ctx.reply(
      [
        'Status: ok',
        `Root: ${config.rootPath}`,
        `Busy: ${isBusy(taskState) ? 'yes' : 'no'}`,
        `Queued: ${taskState.queuedTasks.length}`,
      ].join('\n'),
    );
  });

  bot.command('reload', async (ctx) => {
    await ctx.reply('Reloading bot...');
    setTimeout(() => {
      bot.stop('reload');
      process.exit(0);
    }, reloadExitDelayMs);
  });

  bot.command('remember', async (ctx) => {
    const payload = getCommandPayload(ctx.text);

    if (payload.startsWith('global ')) {
      await rememberGlobal(payload.slice('global '.length).trim());
      await ctx.reply('Saved to global memory.');
      return;
    }

    if (payload.startsWith('server ')) {
      await rememberWorkspace(rootMemoryId, payload.slice('server '.length).trim());
      await ctx.reply('Saved to server memory.');
      return;
    }

    await ctx.reply('Use /remember global <text> or /remember server <text>');
  });

  bot.command('memory', async (ctx) => {
    const memory = await readMarkdownMemory(rootMemoryId);
    await ctx.reply(
      truncateText(
        ['# Global Memory', memory.global || '(empty)', '', '# Server Memory', memory.workspace || '(empty)'].join('\n'),
        3500,
      ),
    );
  });

  bot.command('forget', async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) {
      await ctx.reply('Cannot clear memory without chat.');
      return;
    }

    await clearShortMemory(chatId, rootMemoryId);
    await ctx.reply('Cleared short memory.');
  });

  bot.hears(/^\/server-status(?:@\w+)?(?:\s|$)/, async (ctx) => {
    try {
      await ctx.reply(codeBlock(await getServerStatus()));
    } catch (error) {
      await ctx.reply(`Server status failed: ${getErrorMessage(error)}`);
    }
  });

  bot.hears(/^\/server-services(?:@\w+)?(?:\s|$)/, async (ctx) => {
    await ctx.reply(formatServices(config));
  });

  bot.hears(/^\/server-logs(?:@\w+)?(?:\s|$)/, async (ctx) => {
    const value = getCommandPayload(ctx.text);
    if (value === '') {
      await ctx.reply('Use /server-logs <name>');
      return;
    }

    try {
      await ctx.reply(codeBlock(await readAllowedLogs(config, value)));
    } catch (error) {
      await ctx.reply(`Server logs failed: ${getErrorMessage(error)}`);
    }
  });

  bot.hears(/^\/server-restart(?:@\w+)?(?:\s|$)/, async (ctx) => {
    const value = getCommandPayload(ctx.text);
    if (value === '') {
      await ctx.reply('Use /server-restart <service>');
      return;
    }

    try {
      await ctx.reply(`Restarting ${value}...`);
      await ctx.reply(await restartAllowedService(config, value));
    } catch (error) {
      await ctx.reply(`Server restart failed: ${getErrorMessage(error)}`);
    }
  });

  bot.command('cancel', async (ctx) => {
    if (taskState.activeTask === undefined) {
      await ctx.reply('No active task.');
      return;
    }

    await taskState.activeTask.abort();
    taskState.activeTask = undefined;
    await ctx.reply('Cancelled active task.');
  });

  bot.action(/^busy:(queue|cancel|ignore):.+$/, async (ctx) => {
    const callbackQuery = ctx.callbackQuery;
    if (!('data' in callbackQuery)) {
      await ctx.answerCbQuery('Invalid busy action');
      return;
    }

    const parts = callbackQuery.data.split(':');
    const action = parts[1];
    const actionId = parts[2];
    if (actionId === undefined) {
      await ctx.answerCbQuery('Invalid busy action');
      return;
    }

    const pending = pendingBusyTasks.get(actionId);
    if (pending === undefined) {
      await ctx.answerCbQuery('Task expired');
      return;
    }

    pendingBusyTasks.delete(actionId);

    if (action === 'queue') {
      queueTask(taskState, pending);
      await ctx.answerCbQuery('Queued');
      await ctx.reply('Queued task.');
      return;
    }

    if (action === 'cancel') {
      await taskState.activeTask?.abort();
      taskState.activeTask = undefined;
      queueTask(taskState, pending);
      await ctx.answerCbQuery('Cancelled current and queued new task');
      await ctx.reply('Cancelled current task and queued new task.');
      return;
    }

    await ctx.answerCbQuery('Ignored');
    await ctx.reply('Ignored new task.');
  });

  const runTask = async (ctx: TaskContext, chatId: number, taskText: string, sourceMessageId: number): Promise<void> => {
    taskState.activeTask = {
      abort: async () => Promise.resolve(),
    };

    const stopTypingIndicator = startTypingIndicator(ctx);
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

    try {
      const shortMemory = await readShortMemory(chatId, rootMemoryId);
      const markdownMemory = await readMarkdownMemory(rootMemoryId);
      const result = await runPiTask({
        rootPath: config.rootPath,
        prompt: taskText,
        shortMemory,
        globalMemory: markdownMemory.global,
        rootMemory: markdownMemory.workspace,
        onToolStart: async (toolCallId, toolName) => {
          const messageIdPromise = ctx
            .reply(`Using ${toolName} tool...`)
            .then(getTelegramMessageId)
            .catch(() => undefined);
          toolMessages.set(toolCallId, messageIdPromise);
          await messageIdPromise;
        },
        onToolEnd: deleteToolMessage,
      });

      await ctx.reply(truncateText(result, 3500));
      await addShortMemoryMessage(chatId, {
        role: 'bot',
        text: result,
        timestamp: new Date().toISOString(),
        workspaceId: rootMemoryId,
        messageId: sourceMessageId,
      });
    } catch (error) {
      await ctx.reply(`Task failed: ${getErrorMessage(error)}`);
    } finally {
      await Promise.all([...toolMessages.keys()].map(deleteToolMessage));
      stopTypingIndicator();
      taskState.activeTask = undefined;
      const queued = popQueuedTask(taskState);
      if (queued !== undefined) {
        await ctx.reply('Starting queued task...');
        await runTask(ctx, chatId, queued, sourceMessageId);
      }
    }
  };

  const submitTask = async (ctx: TaskContext, chatId: number, messageId: number, text: string): Promise<void> => {
    await addShortMemoryMessage(chatId, {
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
      workspaceId: rootMemoryId,
      messageId,
    });

    if (isBusy(taskState)) {
      const actionId = `${Date.now()}-task`;
      pendingBusyTasks.set(actionId, text);
      await ctx.reply('Bot is busy. What should I do?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Queue', callback_data: `busy:queue:${actionId}` }],
            [{ text: 'Cancel current', callback_data: `busy:cancel:${actionId}` }],
            [{ text: 'Ignore', callback_data: `busy:ignore:${actionId}` }],
          ],
        },
      });
      return;
    }

    void runTask(ctx, chatId, text, messageId);
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
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      const voiceBuffer = await downloadTelegramFile(fileLink);
      const transcript = await transcribeVoiceBuffer(voiceBuffer, config.voice);
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

  bot.on('text', async (ctx) => {
    const text = getMessageText(ctx);
    const messageId = getMessageId(ctx);
    const chatId = getChatId(ctx);

    if (text === undefined || messageId === undefined || chatId === undefined) {
      await ctx.reply('Cannot run task without text and chat.');
      return;
    }

    if (text.startsWith('/')) {
      return;
    }

    await submitTask(ctx, chatId, messageId, text);
  });

  void bot.launch();

  process.once('SIGINT', () => {
    bot.stop('SIGINT');
  });

  process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
  });
};

void main();
