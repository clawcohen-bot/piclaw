import {
  type AuthProviderOption,
  findAuthProviderOption,
  getAllAuthProviderOptions,
  getAvailableModels,
  getConfiguredProviderCount,
  getConnectedAuthProviderStatuses,
  getSafeAuthStatus,
  loginOAuthProvider,
  logoutAuthProvider,
  setApiKeyCredential,
} from '../agent/model';
import { getErrorMessage } from '../core/error';
import type { PiclawExtensionAPI } from '../core/extension-api';

type PendingAuthInput = {
  kind: 'api_key' | 'oauth_input';
  providerId: string;
  label: string;
  secret: boolean;
  resolve: (value: string) => void;
  reject?: (error: Error) => void;
  abortController?: AbortController;
};

type MessageInput = {
  conversationId?: string;
  messageId?: string;
  text?: string;
  context?: any;
};

type MessageResult = {
  handled: boolean;
  deleteMessage?: boolean;
  response?: string;
};

const pendingAuthByConversation = new Map<string, PendingAuthInput>();

const chunkRows = <T>(items: T[], size: number): T[][] => {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
};

const isAuthProviderAuthType = (value: string | undefined): value is AuthProviderOption['authType'] =>
  value === 'oauth' || value === 'api_key';

const reply = async (context: any, text: string, extra?: unknown): Promise<boolean> => {
  if (typeof context?.reply !== 'function') {
    return false;
  }
  await context.reply(text, extra);
  return true;
};

const answerCallback = async (context: any, message: string): Promise<void> => {
  if (typeof context?.answerCbQuery === 'function') {
    await context.answerCbQuery(message);
  }
};

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

const showLoginMenu = async (context: any): Promise<string | void> => {
  const options = getAllAuthProviderOptions();
  if (await reply(context, `Choose auth provider:\n\nConfigured providers: ${getConfiguredProviderCount()}`, {
    reply_markup: {
      inline_keyboard: chunkRows(options, 1).map((row) =>
        row.map((option) => ({
          text: `${option.authType === 'oauth' ? 'Subscription' : 'API key'}: ${option.name}`.slice(0, 64),
          callback_data: `authlogin:${option.authType}:${option.id}`,
        })),
      ),
    },
  })) {
    return;
  }

  return [
    `Configured providers: ${getConfiguredProviderCount()}`,
    '',
    'Use /login <provider-id>.',
    ...options.map((option) => `- ${option.id} (${option.authType})`),
  ].join('\n');
};

const waitForAuthInput = async (
  conversationId: string,
  input: Omit<PendingAuthInput, 'resolve'>,
): Promise<string> =>
  new Promise((resolve, reject) => {
    pendingAuthByConversation.set(conversationId, { ...input, resolve, reject });
  });

const startApiKeyLogin = async (context: any, conversationId: string, option: AuthProviderOption): Promise<void> => {
  if (pendingAuthByConversation.has(conversationId)) {
    await reply(context, 'Auth is already waiting for input. Use /cancel-auth first.');
    return;
  }

  try {
    await reply(context, `Send the API key for ${option.name}.\nI will try to delete your key message.`);
    const apiKey = await waitForAuthInput(conversationId, {
      kind: 'api_key',
      providerId: option.id,
      label: option.name,
      secret: true,
    });
    setApiKeyCredential(option.id, apiKey.trim());
    await reply(
      context,
      `Saved ${option.name}.\nConfigured providers: ${getConfiguredProviderCount()}\nAvailable models: ${getAvailableModels().length}\nUse /model to choose.`,
    );
  } catch (error) {
    await reply(context, `Auth cancelled: ${getErrorMessage(error)}`);
  } finally {
    pendingAuthByConversation.delete(conversationId);
  }
};

const startOAuthLogin = async (context: any, conversationId: string, option: AuthProviderOption): Promise<void> => {
  if (pendingAuthByConversation.has(conversationId)) {
    await reply(context, 'Auth is already waiting for input. Use /cancel-auth first.');
    return;
  }

  const abortController = new AbortController();
  await reply(context, `Starting login for ${option.name}...`);
  try {
    await loginOAuthProvider(option.id, {
      onAuth: (info) => {
        void reply(context, [`Login URL for ${option.name}:`, info.url, '', info.instructions ?? 'Open the URL and finish login.'].join('\n'));
      },
      onPrompt: async (prompt) => {
        await reply(context, `${prompt.message}${prompt.placeholder ? `\n${prompt.placeholder}` : ''}`);
        return waitForAuthInput(conversationId, {
          kind: 'oauth_input',
          providerId: option.id,
          label: option.name,
          secret: false,
          abortController,
        });
      },
      onProgress: (message) => {
        void reply(context, message);
      },
      onManualCodeInput: async () => {
        await reply(context, 'Paste the redirect URL/code here, or complete login in browser.');
        return waitForAuthInput(conversationId, {
          kind: 'oauth_input',
          providerId: option.id,
          label: option.name,
          secret: true,
          abortController,
        });
      },
      onSelect: async (prompt) => {
        await reply(
          context,
          [prompt.message, ...prompt.options.map((selectOption) => `${selectOption.id}: ${selectOption.label}`), 'Send the option id.'].join('\n'),
        );
        return waitForAuthInput(conversationId, {
          kind: 'oauth_input',
          providerId: option.id,
          label: option.name,
          secret: false,
          abortController,
        });
      },
      signal: abortController.signal,
    });
    await reply(
      context,
      `Logged in to ${option.name}.\nConfigured providers: ${getConfiguredProviderCount()}\nAvailable models: ${getAvailableModels().length}\nUse /model to choose.`,
    );
  } catch (error) {
    await reply(context, `Login failed: ${getErrorMessage(error)}`);
  } finally {
    pendingAuthByConversation.delete(conversationId);
  }
};

const startLogin = async (
  context: any,
  conversationId: string,
  providerId: string,
  authType?: AuthProviderOption['authType'],
): Promise<void> => {
  const option = findAuthProviderOption(providerId, authType);
  if (option === undefined) {
    await reply(context, 'Unknown auth provider. Use /login to see options.');
    return;
  }

  if (option.authType === 'api_key') {
    await startApiKeyLogin(context, conversationId, option);
    return;
  }

  await startOAuthLogin(context, conversationId, option);
};

const runLoginInBackground = (context: any, conversationId: string, providerId: string, authType?: AuthProviderOption['authType']): void => {
  void startLogin(context, conversationId, providerId, authType).catch((error: unknown) => {
    void reply(context, `Login failed: ${getErrorMessage(error)}`);
  });
};

export const registerAuthExtension = (piclaw: PiclawExtensionAPI): void => {
  piclaw.registerCommand({
    name: 'login',
    description: 'Connect LLM provider auth.',
    handler: async (input) => {
      if (input.conversationId === undefined) {
        return 'Cannot login without conversation.';
      }

      const providerId = input.args.trim();
      if (providerId === '') {
        return showLoginMenu(input.context);
      }

      runLoginInBackground(input.context, input.conversationId, providerId);
    },
  });

  piclaw.registerCallbackAction({
    name: 'authlogin',
    description: 'Start auth login from an inline button.',
    pattern: /^authlogin:(oauth|api_key):.+$/,
    handler: async (input) => {
      if (input.conversationId === undefined) {
        await answerCallback(input.context, 'Invalid login action');
        return;
      }

      const [, authType, providerId] = input.data.split(':');
      if (!isAuthProviderAuthType(authType) || providerId === undefined) {
        await answerCallback(input.context, 'Invalid login action');
        return;
      }

      await answerCallback(input.context, 'Selected');
      runLoginInBackground(input.context, input.conversationId, providerId, authType);
    },
  });

  piclaw.registerCommand({
    name: 'logout',
    description: 'Remove LLM provider auth.',
    handler: async (input) => {
      const payload = input.args.trim();
      if (payload === '') {
        const statuses = getConnectedAuthProviderStatuses();
        if (statuses.length === 0) {
          return 'No configured auth providers.';
        }
        if (await reply(input.context, 'Choose provider to logout:', {
          reply_markup: {
            inline_keyboard: statuses.map((status) => [
              { text: `${status.name} (${status.provider})`.slice(0, 64), callback_data: `authlogout:${status.provider}` },
            ]),
          },
        })) {
          return;
        }
        return ['Choose provider to logout:', ...statuses.map((status) => `- /logout ${status.provider}`)].join('\n');
      }

      if (await reply(input.context, `Confirm logout from ${payload}?`, {
        reply_markup: {
          inline_keyboard: [[{ text: 'Confirm logout', callback_data: `authlogout:${payload}` }]],
        },
      })) {
        return;
      }
      return `Run /logout ${payload} again from a callback-capable connector to confirm.`;
    },
  });

  piclaw.registerCallbackAction({
    name: 'authlogout',
    description: 'Logout from an auth provider from an inline button.',
    pattern: /^authlogout:.+$/,
    handler: async (input) => {
      const providerId = input.data.slice('authlogout:'.length);
      logoutAuthProvider(providerId);
      await answerCallback(input.context, 'Logged out');
      return `Logged out from ${providerId}.\nConfigured providers: ${getConfiguredProviderCount()}\nAvailable models: ${getAvailableModels().length}`;
    },
  });

  piclaw.registerCommand({
    name: 'auth-status',
    description: 'Show LLM provider auth status.',
    handler: (input) => {
      const payload = input.args.trim();
      if (payload !== '') {
        return formatAuthStatus(payload);
      }

      const statuses = getConnectedAuthProviderStatuses();
      if (statuses.length === 0) {
        return `No configured auth providers.\nAvailable models: ${getAvailableModels().length}`;
      }

      return [
        `Configured providers: ${statuses.length}`,
        `Available models: ${getAvailableModels().length}`,
        '',
        ...statuses.map((status) => `${status.configured ? '✅' : '❌'} ${status.name} (${status.provider}) - ${status.modelCount} models`),
      ].join('\n');
    },
  });

  piclaw.registerCommand({
    name: 'auth-list',
    description: 'List LLM provider auth options.',
    handler: () => {
      const options = getAllAuthProviderOptions();
      return [
        `Auth options: ${options.length}`,
        ...options.map((option) => `- ${option.authType === 'oauth' ? 'subscription' : 'api key'}: ${option.name} (${option.id})`),
      ].join('\n');
    },
  });

  piclaw.registerCommand({
    name: 'cancel-auth',
    description: 'Cancel pending auth input.',
    handler: async (input) => {
      if (input.conversationId === undefined) {
        return 'Cannot cancel auth without conversation.';
      }

      const pending = pendingAuthByConversation.get(input.conversationId);
      if (pending === undefined) {
        return 'No pending auth.';
      }

      pending.abortController?.abort();
      pending.reject?.(new Error('Auth cancelled'));
      pendingAuthByConversation.delete(input.conversationId);
      return 'Cancelled auth.';
    },
  });

  piclaw.registerTool({
    name: 'auth.handle-text-input',
    description: 'Handle pending interactive auth input for a conversation.',
    handler: (rawInput: unknown): MessageResult => {
      const input = rawInput as MessageInput;
      if (input.conversationId === undefined || input.text === undefined) {
        return { handled: false };
      }

      const pending = pendingAuthByConversation.get(input.conversationId);
      if (pending === undefined) {
        return { handled: false };
      }

      pendingAuthByConversation.delete(input.conversationId);
      pending.resolve(input.text);
      return {
        handled: true,
        deleteMessage: pending.secret,
        response: pending.kind === 'api_key' ? 'Received key. Saving...' : 'Received auth input. Continuing...',
      };
    },
  });
};

export default registerAuthExtension;
