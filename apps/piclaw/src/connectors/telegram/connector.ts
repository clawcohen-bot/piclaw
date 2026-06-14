import type { AppConfig } from '../../core/config';
import type { Connector, ConnectorContext } from '../types';
import { createAuthMiddleware } from './auth';
import { registerTelegramRuntimeHandlers } from './runtime-handlers';
import { Context, Telegraf } from 'telegraf';

let activeBot: Telegraf<Context> | undefined;

export const createTelegramConnector = (config: AppConfig): Connector => ({
  name: 'telegram',
  start: (context?: ConnectorContext) => startTelegramConnector(config, context),
  stop: (reason = 'stop') => {
    activeBot?.stop(reason);
  },
});

export const startTelegramConnector = async (config: AppConfig, context?: ConnectorContext): Promise<void> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
  }

  const bot = new Telegraf(token);
  activeBot = bot;

  if (context === undefined) {
    throw new Error('Telegram connector requires Piclaw runtime');
  }

  bot.use(createAuthMiddleware(config));
  registerTelegramRuntimeHandlers(bot, config, context.runtime);

  void bot.launch();

  process.once('SIGINT', () => {
    bot.stop('SIGINT');
  });

  process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
  });
};
