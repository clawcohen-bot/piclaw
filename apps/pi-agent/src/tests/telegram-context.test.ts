import { describe, expect, it } from 'vitest';

import { getChatId, getUserId } from '../telegram-context';

describe('telegram context helpers', () => {
  it('reads chat ids from ctx.chat or ctx.message.chat', () => {
    expect(getChatId({ chat: { id: 1 } } as never)).toBe(1);
    expect(getChatId({ message: { chat: { id: 2 } } } as never)).toBe(2);
    expect(getChatId({ message: { chat: { id: 'bad' } } } as never)).toBeUndefined();
    expect(getChatId({ message: { chat: null } } as never)).toBeUndefined();
    expect(getChatId({ message: {} } as never)).toBeUndefined();
  });

  it('reads user ids from ctx.from', () => {
    expect(getUserId({ from: { id: 7 } } as never)).toBe(7);
    expect(getUserId({} as never)).toBeUndefined();
  });
});
