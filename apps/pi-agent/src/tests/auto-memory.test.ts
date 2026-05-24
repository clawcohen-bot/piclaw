import { describe, expect, it } from 'vitest';

import { parseAutoMemoryUpdate } from '../auto-memory';

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
});
