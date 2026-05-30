import type { Context } from 'telegraf';

type TelegramMessage = {
  message_id: number;
};

type TextMessage = TelegramMessage & {
  text: string;
};

const hasMessageId = (value: unknown): value is TelegramMessage => {
  if (typeof value !== 'object' || value === null || !('message_id' in value)) {
    return false;
  }

  return typeof value.message_id === 'number';
};

const hasTextMessage = (value: unknown): value is TextMessage => {
  if (!hasMessageId(value) || !('text' in value)) {
    return false;
  }

  return typeof value.text === 'string';
};

export const getMessageText = (ctx: Context): string | undefined => {
  if (hasTextMessage(ctx.message)) {
    return ctx.message.text;
  }

  return undefined;
};

export const getMessageId = (ctx: Context): number | undefined => {
  if (hasMessageId(ctx.message)) {
    return ctx.message.message_id;
  }

  return undefined;
};
