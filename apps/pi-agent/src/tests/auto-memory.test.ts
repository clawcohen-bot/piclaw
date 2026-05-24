import { describe, expect, it } from 'vitest';

import { parseAutoMemoryUpdate, shouldReviewMemory } from '../auto-memory';

describe('auto memory parser', () => {
  it('parses JSON surrounded by model text', () => {
    expect(
      parseAutoMemoryUpdate('```json\n{"memory":"  - user prefers short replies  ","notification":" Saved memory: prefers short replies. "}\n```'),
    ).toEqual({
      memory: '- user prefers short replies',
      notification: 'Saved memory: prefers short replies.',
    });
  });

  it('returns undefined for invalid output or wrong shapes', () => {
    expect(parseAutoMemoryUpdate('no json')).toBeUndefined();
    expect(parseAutoMemoryUpdate('{"memory":"ok"}')).toBeUndefined();
    expect(parseAutoMemoryUpdate('{bad json')).toBeUndefined();
  });

  it('reviews only likely important memory messages', () => {
    expect(shouldReviewMemory('my name is Shmuel')).toBe(true);
    expect(shouldReviewMemory('I prefer short replies')).toBe(true);
    expect(shouldReviewMemory('remember that I use pnpm')).toBe(true);
    expect(shouldReviewMemory('forget this memory')).toBe(true);

    expect(shouldReviewMemory('hi')).toBe(false);
    expect(shouldReviewMemory('please inspect the current files')).toBe(false);
    expect(shouldReviewMemory('run the tests after changing it')).toBe(false);
  });
});
