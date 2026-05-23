import { describe, expect, it } from 'vitest';

import type { PendingRestart } from '../types';

describe('PendingRestart type', () => {
  it('accepts the restart approval shape used by runtime code', () => {
    const pending: PendingRestart = { id: 'abc', service: 'demo.service', chatId: 1, userId: 2, createdAt: 123 };
    expect(pending).toEqual({ id: 'abc', service: 'demo.service', chatId: 1, userId: 2, createdAt: 123 });
  });
});
