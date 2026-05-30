import { describe, expect, it } from 'vitest';

import { createApprovalKeyboard } from './approval';

describe('createApprovalKeyboard', () => {
  it('builds approve and reject callback buttons for the action id', () => {
    expect(createApprovalKeyboard('restart-1')).toMatchObject({
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Approve', callback_data: 'approve:restart-1' }],
          [{ text: '❌ Reject', callback_data: 'reject:restart-1' }],
        ],
      },
    });
  });
});
