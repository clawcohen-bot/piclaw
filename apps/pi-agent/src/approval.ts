import { Markup } from 'telegraf';

export const createApprovalKeyboard = (actionId: string) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✅ Approve', `approve:${actionId}`)],
    [Markup.button.callback('❌ Reject', `reject:${actionId}`)],
  ]);
