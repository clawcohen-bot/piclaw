import { describe, expect, it } from 'vitest';

import { getMessageId, getMessageText } from '../telegram-text';

describe('telegram text helpers', () => {
  it('reads text only from text messages', () => {
    expect(getMessageText({ message: { message_id: 1, text: 'hello' } } as never)).toBe('hello');
    expect(getMessageText({ message: { message_id: 1 } } as never)).toBeUndefined();
    expect(getMessageText({ message: { message_id: 1, text: 123 } } as never)).toBeUndefined();
  });

  it('reads numeric message ids', () => {
    expect(getMessageId({ message: { message_id: 5 } } as never)).toBe(5);
    expect(getMessageId({ message: { message_id: '5' } } as never)).toBeUndefined();
    expect(getMessageId({ message: null } as never)).toBeUndefined();
  });
});
