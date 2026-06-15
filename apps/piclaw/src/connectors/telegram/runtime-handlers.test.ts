import { describe, expect, it } from 'vitest';
import type { Context } from 'telegraf';

import { withTelegramContextValue } from './runtime-handlers';

describe('telegram runtime handlers', () => {
  it('adds command text without writing to Telegraf readonly getters', () => {
    const ctx = {
      reply: (message: string) => message,
      get text() {
        return 'original';
      },
    } as unknown as Context;

    expect(() => Object.assign(ctx, { text: '/start' })).toThrow();

    const wrapped = withTelegramContextValue(ctx, 'text', '/start');

    expect(wrapped.text).toBe('/start');
    expect(wrapped.reply('ok')).toBe('ok');
  });
});
