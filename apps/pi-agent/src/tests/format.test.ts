import { describe, expect, it } from 'vitest';

import { codeBlock, escapeTelegramHtml, telegramHtmlFromMarkdown } from '../format';

describe('format helpers', () => {
  it('escapes telegram html control characters', () => {
    expect(escapeTelegramHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('wraps code text in telegram html pre tags', () => {
    expect(codeBlock('const x = 1 < 2;')).toBe('<pre>const x = 1 &lt; 2;</pre>');
  });

  it('formats markdown-ish text as telegram html', () => {
    expect(telegramHtmlFromMarkdown('# Title\n**bold** `code`')).toBe('<b>Title</b>\n<b>bold</b> <code>code</code>');
  });

  it('formats fenced code blocks as telegram html pre tags', () => {
    expect(telegramHtmlFromMarkdown('Run:\n```ts\nconst x = 1 < 2;\n```')).toBe('Run:\n<pre>const x = 1 &lt; 2;</pre>');
  });
});
