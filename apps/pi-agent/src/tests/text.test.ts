import { describe, expect, it } from 'vitest';

import { getCommandPayload, truncateText } from '../text';

describe('text helpers', () => {
  it('extracts command payload after the first space', () => {
    expect(getCommandPayload('/mode ask')).toBe('ask');
    expect(getCommandPayload('  /remember   hello world  ')).toBe('hello world');
    expect(getCommandPayload('/status')).toBe('');
  });

  it('truncates only when text is longer than the limit', () => {
    expect(truncateText('abc', 3)).toBe('abc');
    expect(truncateText('abcdef', 4)).toBe('abc…');
  });
});
