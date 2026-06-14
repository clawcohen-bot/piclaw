import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
};

export type PiclawPackageManifest = {
  name: string;
  rootPath: string;
  extensions: string[];
  skills: string[];
  prompts: string[];
};

export type PiclawPackageResources = {
  packages: PiclawPackageManifest[];
  extensionPaths: string[];
  skillPaths: string[];
  promptPaths: string[];
};

export const readPiclawPackageManifest = async (packagePath: string): Promise<PiclawPackageManifest | undefined> => {
  const rootPath = resolve(packagePath);
  const manifestPath = rootPath.endsWith('package.json') ? rootPath : resolve(rootPath, 'package.json');
  if (!existsSync(manifestPath)) {
    return undefined;
  }

  const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!isRecord(parsed) || typeof parsed.name !== 'string' || !isRecord(parsed.piclaw)) {
    return undefined;
  }

  const packageRoot = dirname(manifestPath);
  return {
    name: parsed.name,
    rootPath: packageRoot,
    extensions: stringArray(parsed.piclaw.extensions).map((path) => resolve(packageRoot, path)),
    skills: stringArray(parsed.piclaw.skills).map((path) => resolve(packageRoot, path)),
    prompts: stringArray(parsed.piclaw.prompts).map((path) => resolve(packageRoot, path)),
  };
};

export const discoverPiclawPackages = async (paths: string[]): Promise<PiclawPackageResources> => {
  const packages: PiclawPackageManifest[] = [];

  for (const path of paths) {
    const manifest = await readPiclawPackageManifest(path);
    if (manifest !== undefined) {
      packages.push(manifest);
    }
  }

  return {
    packages: packages.sort((left, right) => left.name.localeCompare(right.name)),
    extensionPaths: [...new Set(packages.flatMap((item) => item.extensions))].sort(),
    skillPaths: [...new Set(packages.flatMap((item) => item.skills))].sort(),
    promptPaths: [...new Set(packages.flatMap((item) => item.prompts))].sort(),
  };
};
