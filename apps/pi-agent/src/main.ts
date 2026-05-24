import { reviewTelegramMemory } from './auto-memory';
import { createAuthMiddleware } from './auth';
import { helpText } from './commands';
import { getConfigPath, loadConfig } from './config';
import { getErrorMessage } from './error';
import { codeBlock, telegramHtmlFromMarkdown } from './format';
import {
  addShortMemoryMessage,
  clearMarkdownMemory,
  clearSessionSummary,
  clearShortMemory,
  readMarkdownMemory,
  readSessionSummary,
  readShortMemory,
  remember,
  writeMarkdownMemory,
  writeSessionSummary,
  writeShortMemory,
} from './memory';
import { formatAgentMode, isAgentMode, readAgentMode, writeAgentMode } from './mode';
import {
  type AuthProviderOption,
  findAuthProviderOption,
  formatModel,
  formatModelLabel,
  getAllAuthProviderOptions,
  getAvailableModels,
  getConfiguredProviderCount,
  getConnectedAuthProviderStatuses,
  getSafeAuthStatus,
  getSelectedModelText,
  loginOAuthProvider,
  logoutAuthProvider,
  readSelectedModel,
  setApiKeyCredential,
  writeSelectedModel,
} from './model';
import { formatPackagesList } from './packages';
import { compactTelegramContext, runPiTask } from './pi-task';
import { formatServices, getServerStatus, readAllowedLogs, restartAllowedService } from './server';
import { formatSkillsList, formatSkillsStatusList } from './skills';
import { ensureAppDirs } from './storage';
import { createTaskState, isBusy, popQueuedTask, queueTask } from './task-state';
import { getChatId } from './telegram-context';
import { getMessageId, getMessageText } from './telegram-text';
import { getCommandPayload, truncateText } from './text';
import {
  buildPiTaskContext,
  calculateContextUsage,
  clearWarnedUsageLevels,
  formatContextUsage,
  formatContextWarning,
  getUsageWarningLevel,
  readWarnedUsageLevels,
  writeWarnedUsageLevels,
} from './usage';
import { downloadTelegramFile, transcribeVoiceBuffer } from './voice';
import { Context, Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;
const rootMemoryId = 'server-root';

const typingIntervalMs = 4000;
const reloadExitDelayMs = 500;
const reloadExitCode = 75;
const rawContextMessageCount = 15;
const compactContextThreshold = 20;

type TypingContext = {
  sendChatAction: (action: 'typing') => Promise<unknown>;
};

type TaskContext = Context & TypingContext;

const replyTelegramHtml = async (ctx: Context, text: string): Promise<void> => {
  await ctx.reply(text, { parse_mode: 'HTML' });
};

type PendingAuthInput = {
  kind: 'api_key' | 'oauth_input';
  providerId: string;
  label: string;
  secret: boolean;
  resolve: (value: string) => void;
  reject?: (error: Error) => void;
  abortController?: AbortController;
};

const chunkRows = <T>(items: T[], size: number): T[][] => {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
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

const isAuthProviderAuthType = (value: string | undefined): value is AuthProviderOption['authType'] =>
  value === 'oauth' || value === 'api_key';

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
  const pendingAuthByChat = new Map<number, PendingAuthInput>();

  bot.use(createAuthMiddleware(config));

  bot.start(async (ctx) => {
    await ctx.reply(`${helpText}\n\nRoot: ${config.rootPath}\nConfig: ${getConfigPath()}`);
  });

  bot.command('status', async (ctx) => {
    const chatId = getChatId(ctx);
    const mode = chatId === undefined ? undefined : await readAgentMode(chatId);
    const model = chatId === undefined ? 'unknown' : await getSelectedModelText(chatId);
    const skills = formatSkillsStatusList(config.rootPath);
    const packages = await formatPackagesList();

    await ctx.reply(
      truncateText(
        [
          'Status: ok',
          '',
          `Root: ${config.rootPath}`,
          `Mode: ${mode === undefined ? 'unknown' : formatAgentMode(mode)}`,
          `Model: ${model}`,
          `Busy: ${isBusy(taskState) ? 'yes' : 'no'}`,
          `Queued: ${taskState.queuedTasks.length}`,
          '',
          skills,
          '',
          packages,
        ].join('\n'),
        3500,
      ),
    );
  });

  bot.command('skills', async (ctx) => {
    await ctx.reply(truncateText(formatSkillsList(config.rootPath), 3500));
  });

  const formatAuthStatus = (providerId: string): string => {
    const status = getSafeAuthStatus(providerId);
    return [
      `${status.name} (${status.provider})`,
      `Connected: ${status.configured ? 'yes' : 'no'}`,
      `Type: ${status.authType ?? 'unknown'}`,
      `Source: ${status.source ?? 'none'}`,
      `Models: ${status.modelCount}`,
    ].join('\n');
  };

  const showLoginMenu = async (ctx: Context): Promise<void> => {
    const options = getAllAuthProviderOptions();
    await ctx.reply(`Choose auth provider:\n\nConfigured providers: ${getConfiguredProviderCount()}`, {
      reply_markup: {
        inline_keyboard: chunkRows(options, 1).map((row) =>
          row.map((option) => ({
            text: `${option.authType === 'oauth' ? 'Subscription' : 'API key'}: ${option.name}`.slice(0, 64),
            callback_data: `authlogin:${option.authType}:${option.id}`,
          })),
        ),
      },
    });
  };

  const waitForAuthInput = async (
    chatId: number,
    input: Omit<PendingAuthInput, 'resolve'>,
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      pendingAuthByChat.set(chatId, { ...input, resolve, reject });
    });

  const startApiKeyLogin = async (ctx: Context, chatId: number, option: AuthProviderOption): Promise<void> => {
    if (pendingAuthByChat.has(chatId)) {
      await ctx.reply('Auth is already waiting for input. Use /cancel-auth first.');
      return;
    }

    try {
      await ctx.reply(`Send the API key for ${option.name}.\nI will try to delete your key message.`);
      const apiKey = await waitForAuthInput(chatId, {
        kind: 'api_key',
        providerId: option.id,
        label: option.name,
        secret: true,
      });
      setApiKeyCredential(option.id, apiKey.trim());
      await ctx.reply(
        `Saved ${option.name}.\nConfigured providers: ${getConfiguredProviderCount()}\nAvailable models: ${getAvailableModels().length}\nUse /model to choose.`,
      );
    } catch (error) {
      await ctx.reply(`Auth cancelled: ${getErrorMessage(error)}`);
    } finally {
      pendingAuthByChat.delete(chatId);
    }
  };

  const startOAuthLogin = async (ctx: Context, chatId: number, option: AuthProviderOption): Promise<void> => {
    if (pendingAuthByChat.has(chatId)) {
      await ctx.reply('Auth is already waiting for input. Use /cancel-auth first.');
      return;
    }

    const abortController = new AbortController();
    await ctx.reply(`Starting login for ${option.name}...`);
    try {
      await loginOAuthProvider(option.id, {
        onAuth: (info) => {
          void ctx.reply([`Login URL for ${option.name}:`, info.url, '', info.instructions ?? 'Open the URL and finish login.'].join('\n'));
        },
        onPrompt: async (prompt) => {
          await ctx.reply(`${prompt.message}${prompt.placeholder ? `\n${prompt.placeholder}` : ''}`);
          return waitForAuthInput(chatId, {
            kind: 'oauth_input',
            providerId: option.id,
            label: option.name,
            secret: false,
            abortController,
          });
        },
        onProgress: (message) => {
          void ctx.reply(message);
        },
        onManualCodeInput: async () => {
          await ctx.reply('Paste the redirect URL/code here, or complete login in browser.');
          return waitForAuthInput(chatId, {
            kind: 'oauth_input',
            providerId: option.id,
            label: option.name,
            secret: true,
            abortController,
          });
        },
        onSelect: async (prompt) => {
          await ctx.reply(
            [prompt.message, ...prompt.options.map((selectOption) => `${selectOption.id}: ${selectOption.label}`), 'Send the option id.'].join('\n'),
          );
          return waitForAuthInput(chatId, {
            kind: 'oauth_input',
            providerId: option.id,
            label: option.name,
            secret: false,
            abortController,
          });
        },
        signal: abortController.signal,
      });
      await ctx.reply(
        `Logged in to ${option.name}.\nConfigured providers: ${getConfiguredProviderCount()}\nAvailable models: ${getAvailableModels().length}\nUse /model to choose.`,
      );
    } catch (error) {
      await ctx.reply(`Login failed: ${getErrorMessage(error)}`);
    } finally {
      pendingAuthByChat.delete(chatId);
    }
  };

  const startLogin = async (
    ctx: Context,
    chatId: number,
    providerId: string,
    authType?: AuthProviderOption['authType'],
  ): Promise<void> => {
    const option = findAuthProviderOption(providerId, authType);
    if (option === undefined) {
      await ctx.reply('Unknown auth provider. Use /login to see options.');
      return;
    }

    if (option.authType === 'api_key') {
      await startApiKeyLogin(ctx, chatId, option);
      return;
    }

    await startOAuthLogin(ctx, chatId, option);
  };

  const runLoginInBackground = (ctx: Context, chatId: number, providerId: string, authType?: AuthProviderOption['authType']): void => {
    void startLogin(ctx, chatId, providerId, authType).catch((error: unknown) => {
      void ctx.reply(`Login failed: ${getErrorMessage(error)}`);
    });
  };

  bot.command('login', async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) {
      await ctx.reply('Cannot login without chat.');
      return;
    }

    const payload = getCommandPayload(ctx.text).trim();
    if (payload === '') {
      await showLoginMenu(ctx);
      return;
    }

    runLoginInBackground(ctx, chatId, payload);
  });

  bot.action(/^authlogin:(oauth|api_key):.+$/, async (ctx) => {
    const chatId = getChatId(ctx);
    const callbackQuery = ctx.callbackQuery;
    if (chatId === undefined || !('data' in callbackQuery)) {
      await ctx.answerCbQuery('Invalid login action');
      return;
    }

    const [, authType, providerId] = callbackQuery.data.split(':');
    if (!isAuthProviderAuthType(authType) || providerId === undefined) {
      await ctx.answerCbQuery('Invalid login action');
      return;
    }

    await ctx.answerCbQuery('Selected');
    runLoginInBackground(ctx, chatId, providerId, authType);
  });

  bot.command('logout', async (ctx) => {
    const payload = getCommandPayload(ctx.text).trim();
    if (payload === '') {
      const statuses = getConnectedAuthProviderStatuses();
      if (statuses.length === 0) {
        await ctx.reply('No configured auth providers.');
        return;
      }
      await ctx.reply('Choose provider to logout:', {
        reply_markup: {
          inline_keyboard: statuses.map((status) => [
            { text: `${status.name} (${status.provider})`.slice(0, 64), callback_data: `authlogout:${status.provider}` },
          ]),
        },
      });
      return;
    }

    await ctx.reply(`Confirm logout from ${payload}?`, {
      reply_markup: {
        inline_keyboard: [[{ text: 'Confirm logout', callback_data: `authlogout:${payload}` }]],
      },
    });
  });

  bot.action(/^authlogout:.+$/, async (ctx) => {
    const callbackQuery = ctx.callbackQuery;
    if (!('data' in callbackQuery)) {
      await ctx.answerCbQuery('Invalid logout action');
      return;
    }

    const providerId = callbackQuery.data.slice('authlogout:'.length);
    logoutAuthProvider(providerId);
    await ctx.answerCbQuery('Logged out');
    await ctx.reply(
      `Logged out from ${providerId}.\nConfigured providers: ${getConfiguredProviderCount()}\nAvailable models: ${getAvailableModels().length}`,
    );
  });

  bot.command('auth-status', async (ctx) => {
    const payload = getCommandPayload(ctx.text).trim();
    if (payload !== '') {
      await ctx.reply(formatAuthStatus(payload));
      return;
    }

    const statuses = getConnectedAuthProviderStatuses();
    if (statuses.length === 0) {
      await ctx.reply(`No configured auth providers.\nAvailable models: ${getAvailableModels().length}`);
      return;
    }

    await ctx.reply(
      [`Configured providers: ${statuses.length}`, `Available models: ${getAvailableModels().length}`, '', ...statuses.map((status) => `${status.configured ? '✅' : '❌'} ${status.name} (${status.provider}) - ${status.modelCount} models`)].join('\n'),
    );
  });

  bot.command('auth-list', async (ctx) => {
    const options = getAllAuthProviderOptions();
    await ctx.reply(
      [`Auth options: ${options.length}`, ...options.map((option) => `- ${option.authType === 'oauth' ? 'subscription' : 'api key'}: ${option.name} (${option.id})`)].join('\n'),
    );
  });

  bot.command('cancel-auth', async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) {
      await ctx.reply('Cannot cancel auth without chat.');
      return;
    }

    const pending = pendingAuthByChat.get(chatId);
    if (pending === undefined) {
      await ctx.reply('No pending auth.');
      return;
    }

    pending.abortController?.abort();
    pending.reject?.(new Error('Auth cancelled'));
    pendingAuthByChat.delete(chatId);
    await ctx.reply('Cancelled auth.');
  });

  bot.command('mode', async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) {
      await ctx.reply('Cannot use /mode without chat.');
      return;
    }

    const payload = getCommandPayload(ctx.text).toLowerCase();
    if (payload === '') {
      const mode = await readAgentMode(chatId);
      await ctx.reply(`Current mode: ${formatAgentMode(mode)}\n\nUse /mode agent or /mode ask`);
      return;
    }

    if (!isAgentMode(payload)) {
      await ctx.reply('Unknown mode. Use /mode agent or /mode ask');
      return;
    }

    await writeAgentMode(chatId, payload);
    await ctx.reply(`Mode changed to ${formatAgentMode(payload)}.`);
  });

  bot.command('model', async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) {
      await ctx.reply('Cannot use /model without chat.');
      return;
    }

    const models = getAvailableModels();
    if (models.length === 0) {
      await ctx.reply('No available models found. Configure Pi auth first.');
      return;
    }

    const current = await getSelectedModelText(chatId);
    await ctx.reply(`Current model: ${current}\n\nChoose a model:`, {
      reply_markup: {
        inline_keyboard: models.map((model, index) => [
          { text: formatModelLabel(model).slice(0, 64), callback_data: `model:${index}` },
        ]),
      },
    });
  });

  bot.action(/^model:\d+$/, async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) {
      await ctx.answerCbQuery('Cannot choose model without chat');
      return;
    }

    const callbackQuery = ctx.callbackQuery;
    if (!('data' in callbackQuery)) {
      await ctx.answerCbQuery('Invalid model action');
      return;
    }

    const index = Number(callbackQuery.data.split(':')[1]);
    const model = getAvailableModels()[index];
    if (model === undefined) {
      await ctx.answerCbQuery('Model not found');
      await ctx.reply('Model list changed. Run /model again.');
      return;
    }

    await writeSelectedModel(chatId, model);
    await ctx.answerCbQuery('Model changed');
    await ctx.reply(`Model changed to ${formatModel(model)}.`);
  });

  bot.command('reload', async (ctx) => {
    await ctx.reply('Reloading bot...');
    setTimeout(() => {
      bot.stop('reload');
      process.exit(reloadExitCode);
    }, reloadExitDelayMs);
  });

  bot.command('remember', async (ctx) => {
    const payload = getCommandPayload(ctx.text);

    if (payload.length === 0) {
      await ctx.reply('Use /remember <text>');
      return;
    }

    await remember(payload);
    await ctx.reply('Saved to memory.');
  });

  bot.command('forget', async (ctx) => {
    await clearMarkdownMemory();
    await ctx.reply('Forgot saved long-term memory.');
  });

  bot.command('memory', async (ctx) => {
    const [memory, summary] = await Promise.all([readMarkdownMemory(), readSessionSummary()]);
    const text = ['Long memory:', memory || '(empty)', '', 'Session compact memory:', summary || '(empty)'].join('\n');
    await replyTelegramHtml(ctx, telegramHtmlFromMarkdown(truncateText(text, 3500)));
  });

  bot.command('new', async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) {
      await ctx.reply('Cannot start new context without chat.');
      return;
    }

    await Promise.all([clearShortMemory(chatId, rootMemoryId), clearSessionSummary(), clearWarnedUsageLevels(chatId)]);
    await ctx.reply('Started new context. Memory was kept.');
  });

  bot.command('usage', async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) {
      await ctx.reply('Cannot show usage without chat.');
      return;
    }

    const { usage, model } = await getCurrentContextUsage(chatId);
    await ctx.reply(formatContextUsage(usage, model));
  });

  bot.hears(/^\/server-status(?:@\w+)?(?:\s|$)/, async (ctx) => {
    try {
      await replyTelegramHtml(ctx, codeBlock(await getServerStatus()));
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
      await replyTelegramHtml(ctx, codeBlock(await readAllowedLogs(config, value)));
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

  const getCurrentContextUsage = async (chatId: number, prompt = '') => {
    const [shortMemory, markdownMemory, sessionSummary, mode, model] = await Promise.all([
      readShortMemory(chatId, rootMemoryId),
      readMarkdownMemory(),
      readSessionSummary(),
      readAgentMode(chatId),
      readSelectedModel(chatId),
    ]);

    const context = buildPiTaskContext({
      rootPath: config.rootPath,
      prompt,
      model,
      shortMemory,
      memory: markdownMemory,
      sessionSummary,
      mode,
    });

    return { usage: calculateContextUsage(context, model), model };
  };

  const sendContextWarningIfNeeded = async (ctx: Context, chatId: number): Promise<void> => {
    const { usage } = await getCurrentContextUsage(chatId);
    const level = getUsageWarningLevel(usage);
    if (level === undefined) {
      return;
    }

    const warned = await readWarnedUsageLevels(chatId);
    if (warned.includes(level)) {
      return;
    }

    await writeWarnedUsageLevels(chatId, [...warned, level]);
    await ctx.reply(formatContextWarning(usage, level));
  };

  const compactContextIfNeeded = async (chatId: number): Promise<void> => {
    const shortMemory = await readShortMemory(chatId, rootMemoryId);
    if (shortMemory.length <= compactContextThreshold) {
      return;
    }

    const messagesToCompact = shortMemory.slice(0, -rawContextMessageCount);
    const messagesToKeep = shortMemory.slice(-rawContextMessageCount);
    if (messagesToCompact.length === 0) {
      return;
    }

    try {
      const model = await readSelectedModel(chatId);
      const summary = await compactTelegramContext({
        rootPath: config.rootPath,
        model,
        existingSummary: await readSessionSummary(),
        messages: messagesToCompact,
      });
      await writeSessionSummary(summary);
      await writeShortMemory(chatId, rootMemoryId, messagesToKeep);
    } catch {
      // Keep raw short memory if compacting fails.
    }
  };

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
      const markdownMemory = await readMarkdownMemory();
      const sessionSummary = await readSessionSummary();
      const mode = await readAgentMode(chatId);
      const model = await readSelectedModel(chatId);
      const result = await runPiTask({
        rootPath: config.rootPath,
        prompt: taskText,
        model,
        shortMemory,
        memory: markdownMemory,
        sessionSummary,
        mode,
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

      await replyTelegramHtml(ctx, telegramHtmlFromMarkdown(truncateText(result, 3500)));
      await addShortMemoryMessage(chatId, {
        role: 'bot',
        text: result,
        timestamp: new Date().toISOString(),
        rootId: rootMemoryId,
        messageId: sourceMessageId,
      });
      await sendContextWarningIfNeeded(ctx, chatId);
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

  const reviewMemoryIfNeeded = async (ctx: Context, chatId: number, text: string): Promise<void> => {
    try {
      const [currentMemory, recentMessages, model] = await Promise.all([
        readMarkdownMemory(),
        readShortMemory(chatId, rootMemoryId),
        readSelectedModel(chatId),
      ]);
      const update = await reviewTelegramMemory({
        rootPath: config.rootPath,
        model,
        currentMemory,
        recentMessages,
        userText: text,
      });

      if (update === undefined || update.memory === currentMemory.trim()) {
        return;
      }

      await writeMarkdownMemory(update.memory);
      if (update.notification !== '') {
        await ctx.reply(truncateText(update.notification, 300));
      }
    } catch {
      // Memory review should never block the user's task.
    }
  };

  const submitTask = async (ctx: TaskContext, chatId: number, messageId: number, text: string): Promise<void> => {
    await reviewMemoryIfNeeded(ctx, chatId, text);
    await addShortMemoryMessage(chatId, {
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
      rootId: rootMemoryId,
      messageId,
    });
    await compactContextIfNeeded(chatId);

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

    const pendingAuth = pendingAuthByChat.get(chatId);
    if (pendingAuth !== undefined) {
      pendingAuthByChat.delete(chatId);
      if (pendingAuth.secret) {
        try {
          await ctx.telegram.deleteMessage(chatId, messageId);
        } catch {
          // Ignore Telegram delete failures.
        }
      }
      pendingAuth.resolve(text);
      await ctx.reply(pendingAuth.kind === 'api_key' ? 'Received key. Saving...' : 'Received auth input. Continuing...');
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
