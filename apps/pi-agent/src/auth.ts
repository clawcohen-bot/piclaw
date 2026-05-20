import type { Context, MiddlewareFn } from 'telegraf';

import type { AppConfig } from './config';

const getUserId = (ctx: Context): number | undefined => ctx.from?.id;

export const isAllowedUser = (config: AppConfig, userId: number | undefined): boolean => {
  if (userId === undefined) {
    return false;
  }

  return config.telegram.allowedUserIds.includes(userId);
};

export const createAuthMiddleware = (config: AppConfig): MiddlewareFn<Context> => async (ctx, next) => {
  if (!isAllowedUser(config, getUserId(ctx))) {
    await ctx.reply('Access denied.');
    return;
  }

  await next();
};
