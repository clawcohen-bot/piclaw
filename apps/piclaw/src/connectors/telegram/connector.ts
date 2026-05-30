import { createAgentRunner, type AgentRunnerCallbacks } from '../../agent/agent-runner';
import type { Connector } from '../types';
import { createAuthMiddleware } from './auth';
import { helpText } from '../../messages/commands';
import { getConfigPath, type AppConfig } from '../../core/config';
import { getErrorMessage } from '../../core/error';
import { codeBlock, telegramHtmlFromMarkdown } from '../../messages/format';
import {
  type CalendarEventDraft,
  createGoogleCalendarAuthUrl,
  createGoogleCalendarEvent,
  disconnectGoogleCalendar,
  formatGoogleCalendarEvents,
  formatGoogleCalendarSetupHelp,
  formatGoogleCalendarStatus,
  getGoogleCalendarCredentials,
  listGoogleCalendarEvents,
  parseCalendarAddDraft,
  saveGoogleCalendarCode,
} from '../../features/calendar/google-calendar';
import {
  clearMarkdownMemory,
  clearSessionSummary,
  clearShortMemory,
  readMarkdownMemory,
  readSessionSummary,
  remember,
} from '../../memory/memory';
import { formatAgentMode, isAgentMode, readAgentMode, writeAgentMode } from '../../agent/mode';
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
  setApiKeyCredential,
  writeSelectedModel,
} from '../../agent/model';
import { formatPackagesList } from '../../features/packages/packages';
import { formatServices, getServerStatus, readAllowedLogs, restartAllowedService } from '../../server/server';
import { formatSkillsStatusList, formatSkillsTelegramHtml } from '../../features/skills/skills';
import { isBusy } from '../../agent/task-state';
import { getChatId } from './telegram-context';
import { getMessageId, getMessageText } from './telegram-text';
import { getCommandPayload, truncateText } from '../../messages/text';
import {
  clearWarnedUsageLevels,
  formatContextUsage,
} from '../../agent/usage';
import { downloadTelegramFile, transcribeVoiceBuffer } from '../../features/voice/voice';
import { addWikiNote, formatWikiOpen, formatWikiSearchResults, formatWikiStatus, searchWiki } from '../../features/wiki/wiki';
import { Context, Telegraf } from 'telegraf';

const rootMemoryId = 'server-root';

const typingIntervalMs = 4000;
const reloadExitDelayMs = 500;
const reloadExitCode = 75;

let activeBot: Telegraf<Context> | undefined;

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

export const createTelegramConnector = (config: AppConfig): Connector => ({ 
  start: () => startTelegramConnector(config),
  stop: (reason = 'stop') => {
    activeBot?.stop(reason);
  },
});

export const startTelegramConnector = async (config: AppConfig): Promise<void> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
  }

  const bot = new Telegraf(token);
  activeBot = bot;
  const agentRunner = createAgentRunner(config);
  const pendingAuthByChat = new Map<number, PendingAuthInput>();
  const pendingCalendarAddsByChat = new Map<number, CalendarEventDraft>();

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
          `Busy: ${isBusy(agentRunner.taskState) ? 'yes' : 'no'}`,
          `Queued: ${agentRunner.taskState.queuedTasks.length}`,
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
    await replyTelegramHtml(ctx, formatSkillsTelegramHtml(config.rootPath));
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

  bot.hears(/^\/wiki(?:@\w+)?(?:\s|$)/, async (ctx) => {
    await ctx.reply(await formatWikiStatus());
  });

  bot.hears(/^\/wiki-add(?:@\w+)?(?:\s|$)/, async (ctx) => {
    const payload = getCommandPayload(ctx.text);
    if (payload.length === 0) {
      await ctx.reply('Use /wiki-add <text>');
      return;
    }

    try {
      const result = await addWikiNote(payload, 'telegram');
      await ctx.reply(`Added to Obsidian wiki.\nInbox: ${result.inboxPath}\nRaw: ${result.rawPath}`);
    } catch (error) {
      await ctx.reply(`Wiki add failed: ${getErrorMessage(error)}`);
    }
  });

  bot.hears(/^\/wiki-search(?:@\w+)?(?:\s|$)/, async (ctx) => {
    const query = getCommandPayload(ctx.text);
    const results = await searchWiki(query);
    await ctx.reply(truncateText(formatWikiSearchResults(query, results), 3500));
  });

  bot.hears(/^\/wiki-open(?:@\w+)?(?:\s|$)/, async (ctx) => {
    await ctx.reply(await formatWikiOpen(getCommandPayload(ctx.text)));
  });

  bot.hears(/^\/calendar(?:@\w+)?(?:\s|$)/, async (ctx) => {
    await ctx.reply(await formatGoogleCalendarStatus());
  });

  bot.hears(/^\/calendar-connect(?:@\w+)?(?:\s|$)/, async (ctx) => {
    const credentials = getGoogleCalendarCredentials();
    if (credentials === undefined) {
      await ctx.reply(formatGoogleCalendarSetupHelp());
      return;
    }

    await ctx.reply(
      [
        'Open this Google link and approve Calendar access:',
        createGoogleCalendarAuthUrl(credentials),
        '',
        'After approval, copy the final redirect URL or code and send:',
        '/calendar-code <redirect-url-or-code>',
      ].join('\n'),
    );
  });

  bot.hears(/^\/calendar-code(?:@\w+)?(?:\s|$)/, async (ctx) => {
    const credentials = getGoogleCalendarCredentials();
    if (credentials === undefined) {
      await ctx.reply(formatGoogleCalendarSetupHelp());
      return;
    }

    const code = getCommandPayload(ctx.text);
    if (code.length === 0) {
      await ctx.reply('Use /calendar-code <redirect-url-or-code>');
      return;
    }

    try {
      await saveGoogleCalendarCode(credentials, code);
      await ctx.reply('Google Calendar connected. Use /calendar-today or /calendar-week.');
    } catch (error) {
      await ctx.reply(`Calendar connect failed: ${getErrorMessage(error)}`);
    }
  });

  bot.hears(/^\/calendar-disconnect(?:@\w+)?(?:\s|$)/, async (ctx) => {
    await disconnectGoogleCalendar();
    await ctx.reply('Google Calendar disconnected.');
  });

  bot.hears(/^\/calendar-today(?:@\w+)?(?:\s|$)/, async (ctx) => {
    const credentials = getGoogleCalendarCredentials();
    if (credentials === undefined) {
      await ctx.reply(formatGoogleCalendarSetupHelp());
      return;
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    try {
      const events = await listGoogleCalendarEvents(credentials, start, end);
      await ctx.reply(truncateText(formatGoogleCalendarEvents('today', events), 3500));
    } catch (error) {
      await ctx.reply(`Calendar read failed: ${getErrorMessage(error)}`);
    }
  });

  bot.hears(/^\/calendar-week(?:@\w+)?(?:\s|$)/, async (ctx) => {
    const credentials = getGoogleCalendarCredentials();
    if (credentials === undefined) {
      await ctx.reply(formatGoogleCalendarSetupHelp());
      return;
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    try {
      const events = await listGoogleCalendarEvents(credentials, start, end);
      await ctx.reply(truncateText(formatGoogleCalendarEvents('this week', events), 3500));
    } catch (error) {
      await ctx.reply(`Calendar read failed: ${getErrorMessage(error)}`);
    }
  });

  bot.hears(/^\/calendar-add(?:@\w+)?(?:\s|$)/, async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) {
      await ctx.reply('Cannot add calendar event without chat.');
      return;
    }

    try {
      const draft = parseCalendarAddDraft(getCommandPayload(ctx.text));
      pendingCalendarAddsByChat.set(chatId, draft);
      await ctx.reply(`Create calendar event?\n${draft.summary}\n${draft.start} - ${draft.end}`, {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Create', callback_data: 'calendaradd:confirm' },
            { text: 'Cancel', callback_data: 'calendaradd:cancel' },
          ]],
        },
      });
    } catch (error) {
      await ctx.reply(getErrorMessage(error));
    }
  });

  bot.action(/^calendaradd:(confirm|cancel)$/, async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) {
      await ctx.answerCbQuery('Cannot use calendar without chat');
      return;
    }

    const callbackQuery = ctx.callbackQuery;
    if (!('data' in callbackQuery)) {
      await ctx.answerCbQuery('Invalid calendar action');
      return;
    }

    const action = callbackQuery.data.split(':')[1];
    const draft = pendingCalendarAddsByChat.get(chatId);
    if (draft === undefined) {
      await ctx.answerCbQuery('No pending event');
      return;
    }

    if (action === 'cancel') {
      pendingCalendarAddsByChat.delete(chatId);
      await ctx.answerCbQuery('Cancelled');
      await ctx.reply('Calendar event cancelled.');
      return;
    }

    const credentials = getGoogleCalendarCredentials();
    if (credentials === undefined) {
      await ctx.answerCbQuery('Calendar not configured');
      await ctx.reply(formatGoogleCalendarSetupHelp());
      return;
    }

    try {
      const event = await createGoogleCalendarEvent(credentials, draft);
      pendingCalendarAddsByChat.delete(chatId);
      await ctx.answerCbQuery('Created');
      await ctx.reply(`Created calendar event:\n${event.summary}\n${event.start}`);
    } catch (error) {
      await ctx.answerCbQuery('Failed');
      await ctx.reply(`Calendar create failed: ${getErrorMessage(error)}`);
    }
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

    const { usage, model } = await agentRunner.getCurrentContextUsage(chatId);
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
    if (!(await agentRunner.cancelActiveTask())) {
      await ctx.reply('No active task.');
      return;
    }
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

    if (action === 'queue') {
      if (!agentRunner.queuePendingTask(actionId)) {
        await ctx.answerCbQuery('Task expired');
        return;
      }
      await ctx.answerCbQuery('Queued');
      await ctx.reply('Queued task.');
      return;
    }

    if (action === 'cancel') {
      if (!(await agentRunner.cancelAndQueuePendingTask(actionId))) {
        await ctx.answerCbQuery('Task expired');
        return;
      }
      await ctx.answerCbQuery('Cancelled current and queued new task');
      await ctx.reply('Cancelled current task and queued new task.');
      return;
    }

    if (!agentRunner.ignorePendingTask(actionId)) {
      await ctx.answerCbQuery('Task expired');
      return;
    }
    await ctx.answerCbQuery('Ignored');
    await ctx.reply('Ignored new task.');
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
