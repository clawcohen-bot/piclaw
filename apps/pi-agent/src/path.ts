import { isAbsolute, resolve } from 'node:path';

export const resolveSystemPath = (basePath: string, requestedPath: string): string =>
  isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(basePath, requestedPath);
