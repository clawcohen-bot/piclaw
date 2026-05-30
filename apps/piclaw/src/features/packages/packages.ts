import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getPiSdkDir } from '../../core/storage';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const getPiSettingsPath = (): string => join(getPiSdkDir(), 'settings.json');

export const getAvailablePackages = async (): Promise<string[]> => {
  try {
    const content = await readFile(getPiSettingsPath(), 'utf8');
    const settings: unknown = JSON.parse(content);

    if (!isRecord(settings) || !isStringArray(settings.packages)) {
      return [];
    }

    return [...settings.packages].sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
};

export const formatPackagesList = async (): Promise<string> => {
  const packages = await getAvailablePackages();

  if (packages.length === 0) {
    return 'Packages:\n  none';
  }

  return ['Packages:', ...packages.map((packageName) => `  - ${packageName}`)].join('\n');
};
