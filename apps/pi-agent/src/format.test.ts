import { describe, expect, it } from 'vitest';

import { codeBlock, plainText } from './format';

describe('format helpers', () => {
  it('wraps code text with a code label', () => {
    expect(codeBlock('const x = 1;')).toBe('Code:\nconst x = 1;');
  });

  it('normalizes telegram markdown-ish text to plain text', () => {
    expect(plainText('# Title\r\nline  \n\n\n## Next  ')).toBe('Title\nline\n\nNext');
  });
});
