import type { Context } from 'telegraf';

type TelegramChat = {
  id: number;
};

type TelegramMessageWithChat = {
  chat: TelegramChat;
};

const hasChatId = (value: unknown): value is TelegramMessageWithChat => {
  if (typeof value !== 'object' || value === null || !('chat' in value)) {
    return false;
  }

  const chat = value.chat;

  if (typeof chat !== 'object' || chat === null || !('id' in chat)) {
    return false;
  }

  return typeof chat.id === 'number';
};

export const getChatId = (ctx: Context): number | undefined => {
  if (ctx.chat?.id !== undefined) {
    return ctx.chat.id;
  }

  if (hasChatId(ctx.message)) {
    return ctx.message.chat.id;
  }

  return undefined;
};

export const getUserId = (ctx: Context): number | undefined => ctx.from?.id;
