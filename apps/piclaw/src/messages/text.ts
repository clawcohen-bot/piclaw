export const getCommandPayload = (text: string): string => {
  const trimmed = text.trim();
  const firstSpace = trimmed.indexOf(' ');

  if (firstSpace === -1) {
    return '';
  }

  return trimmed.slice(firstSpace + 1).trim();
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
};
