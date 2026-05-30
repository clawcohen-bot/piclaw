const htmlReplacements: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

export const escapeTelegramHtml = (text: string): string =>
  text.replace(/[&<>]/g, (character) => htmlReplacements[character] ?? character);

const formatInlineMarkdown = (text: string): string => {
  const escaped = escapeTelegramHtml(text);

  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/^#{1,6} (.+)$/gm, '<b>$1</b>');
};

export const telegramHtmlFromMarkdown = (text: string): string => {
  const parts = text.split('```');

  return parts
    .map((part, index) => {
      if (index % 2 === 0) {
        return formatInlineMarkdown(part);
      }

      const lines = part.replace(/^\w+\n/, '');
      return `<pre>${escapeTelegramHtml(lines.trim())}</pre>`;
    })
    .join('');
};

export const codeBlock = (text: string): string => `<pre>${escapeTelegramHtml(text)}</pre>`;
