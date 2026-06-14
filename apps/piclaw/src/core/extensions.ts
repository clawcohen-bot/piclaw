import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { PiclawExtension, PiclawExtensionAPI } from './extension-api';

const supportedExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);

export type ExtensionLoadResult = {
  path: string;
  loaded: boolean;
  error?: unknown;
};

export const getDefaultExtensionPaths = (rootPath: string): string[] => [
  resolve(homedir(), '.piclaw', 'extensions'),
  resolve(rootPath, '.piclaw', 'extensions'),
];

const isSupportedExtensionFile = (path: string): boolean => supportedExtensions.has(extname(path));

export const discoverExtensionFiles = async (paths: string[]): Promise<string[]> => {
  const discovered: string[] = [];

  for (const path of paths) {
    const absolutePath = resolve(path);
    if (!existsSync(absolutePath)) {
      continue;
    }

    if (isSupportedExtensionFile(absolutePath)) {
      discovered.push(absolutePath);
      continue;
    }

    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const filePath = resolve(absolutePath, entry.name);
      if (isSupportedExtensionFile(filePath)) {
        discovered.push(filePath);
      }
    }
  }

  return [...new Set(discovered)].sort();
};

const getDefaultExport = async (path: string): Promise<PiclawExtension> => {
  const module = (await import(pathToFileURL(path).href)) as { default?: unknown };
  if (typeof module.default !== 'function') {
    throw new Error(`Extension must export a default function: ${path}`);
  }
  return module.default as PiclawExtension;
};

export const loadExtensionFile = async (path: string, api: PiclawExtensionAPI): Promise<void> => {
  const extension = await getDefaultExport(resolve(path));
  await extension(api);
};

export const loadExtensions = async (
  paths: string[],
  api: PiclawExtensionAPI,
  options: { failFast?: boolean } = {},
): Promise<ExtensionLoadResult[]> => {
  const files = await discoverExtensionFiles(paths);
  const results: ExtensionLoadResult[] = [];

  for (const file of files) {
    try {
      await loadExtensionFile(file, api);
      results.push({ path: file, loaded: true });
    } catch (error) {
      if (options.failFast === true) {
        throw error;
      }
      api.logger.error(`Failed to load Piclaw extension: ${file}`, error);
      results.push({ path: file, loaded: false, error });
    }
  }

  return results;
};
