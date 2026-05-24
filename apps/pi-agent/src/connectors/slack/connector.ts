import { App } from '@slack/bolt';
import { createAgentRunner, type AgentRunnerCallbacks } from '../../agent-runner';
import type { AppConfig } from '../../config';
import { getErrorMessage } from '../../error';
import { truncateText } from '../../text';
import type { Connector } from '../types';

const replyLimit = 3500;

let activeApp: App | undefined;

type SlackMessageContext = {
  channel: string;
  threadTs?: string;
};

type SlackRunnableMessageEvent = {
  channel: string;
  channel_type?: string;
  ts: string;
  user?: string;
  text?: string;
  thread_ts?: string;
  subtype?: string;
  bot_id?: string;
};

const getSlackTokens = (): { token: string; appToken: string; signingSecret: string } => {
  const token = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? 'socket-mode';

  if (!token) {
    throw new Error('Missing SLACK_BOT_TOKEN');
  }

  if (!appToken) {
    throw new Error('Missing SLACK_APP_TOKEN');
  }

  return { token, appToken, signingSecret };
};

export const createSlackConversationKey = (channel: string, threadTs?: string): string =>
  ['slack', channel, threadTs].filter(Boolean).join('-');

export const stripSlackBotMention = (text: string): string =>
  text.replace(/<@[A-Z0-9]+>\s*/g, '').trim();

const isAllowedSlackUser = (config: AppConfig, userId: string | undefined): boolean =>
  userId !== undefined && config.slack.allowedUserIds.includes(userId);

const isRunnableSlackText = (text: string | undefined): text is string =>
  typeof text === 'string' && text.trim() !== '';

const createSlackRunnerCallbacks = (
  app: App,
  runner: ReturnType<typeof createAgentRunner>,
  context: SlackMessageContext,
): AgentRunnerCallbacks => {
  const reply = async (text: string): Promise<void> => {
    await app.client.chat.postMessage({
      channel: context.channel,
      thread_ts: context.threadTs,
      text: truncateText(text, replyLimit),
    });
  };

  return {
    sendReply: reply,
    sendFormattedReply: reply,
    startTyping: () => () => undefined,
    onToolStart: async (_toolCallId, toolName) => {
      await reply(`Using ${toolName} tool...`);
    },
    onToolEnd: async () => undefined,
    onBusy: async (actionId) => {
      await reply('Bot is busy. Queued your task.');
      runner.queuePendingTask(actionId);
    },
    onQueuedStart: async () => {
      await reply('Starting queued task...');
    },
  };
};

const submitSlackTask = async (
  app: App,
  runner: ReturnType<typeof createAgentRunner>,
  channel: string,
  messageTs: string,
  _userId: string,
  text: string,
  threadTs?: string,
): Promise<void> => {
  await runner.submitTask({
    conversationKey: createSlackConversationKey(channel, threadTs),
    messageId: messageTs,
    text,
    callbacks: createSlackRunnerCallbacks(app, runner, { channel, threadTs: threadTs ?? messageTs }),
  });
};

const isGenericMessage = (event: unknown): event is SlackRunnableMessageEvent => {
  if (typeof event !== 'object' || event === null) {
    return false;
  }

  return 'type' in event && event.type === 'message' && 'channel' in event && typeof event.channel === 'string';
};

export const createSlackConnector = (config: AppConfig): Connector => ({
  start: () => startSlackConnector(config),
  stop: () => {
    void activeApp?.stop();
  },
});

export const startSlackConnector = async (config: AppConfig): Promise<void> => {
  const { token, appToken, signingSecret } = getSlackTokens();
  const app = new App({ token, appToken, signingSecret, socketMode: true });
  activeApp = app;
  const runner = createAgentRunner(config);

  app.event('app_mention', async ({ event }) => {
    const userId = event.user;
    if (userId === undefined || !isAllowedSlackUser(config, userId)) {
      return;
    }

    const text = stripSlackBotMention(event.text ?? '');
    if (!isRunnableSlackText(text)) {
      return;
    }

    await submitSlackTask(app, runner, event.channel, event.ts, userId, text, event.thread_ts ?? event.ts);
  });

  app.event('message', async ({ event }) => {
    const messageEvent = event as unknown;
    if (!isGenericMessage(messageEvent)) {
      return;
    }

    if (messageEvent.subtype !== undefined || messageEvent.bot_id !== undefined) {
      return;
    }

    if (messageEvent.channel_type !== 'im') {
      return;
    }

    const userId = messageEvent.user;
    if (userId === undefined || !isAllowedSlackUser(config, userId)) {
      return;
    }

    if (!isRunnableSlackText(messageEvent.text)) {
      return;
    }

    await submitSlackTask(app, runner, messageEvent.channel, messageEvent.ts, userId, messageEvent.text.trim(), messageEvent.thread_ts);
  });

  await app.start();
};
