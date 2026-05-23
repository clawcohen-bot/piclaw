import { describe, expect, it } from 'vitest';

import { getErrorMessage } from './error';

describe('getErrorMessage', () => {
  it('returns Error messages and hides non-error values', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('boom')).toBe('Unknown error');
    expect(getErrorMessage({ message: 'boom' })).toBe('Unknown error');
  });
});
