export const codeBlock = (text: string): string => ['Code:', text].join('\n');

export const plainText = (text: string): string => {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').map((line) => line.replace(/^#{1,6}\s+/, '').trimEnd());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
