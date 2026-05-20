import { isAbsolute, relative, resolve } from 'node:path';

export const resolveWorkspacePath = (workspacePath: string, requestedPath: string): string | undefined => {
  const absolutePath = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(workspacePath, requestedPath);
  const relativePath = relative(workspacePath, absolutePath);

  if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
    return absolutePath;
  }

  return undefined;
};
