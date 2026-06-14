import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discoverPiclawPackages, readPiclawPackageManifest } from './package-discovery';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'packages-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('package discovery', () => {
  it('reads local package resources from package.json', async () => {
    const packageDir = join(tempDir, 'piclaw-wiki');
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({
      name: 'piclaw-wiki',
      keywords: ['piclaw-package'],
      piclaw: {
        extensions: ['extensions'],
        skills: ['skills'],
        prompts: ['prompts'],
      },
    }));

    await expect(readPiclawPackageManifest(packageDir)).resolves.toEqual({
      name: 'piclaw-wiki',
      rootPath: packageDir,
      extensions: [join(packageDir, 'extensions')],
      skills: [join(packageDir, 'skills')],
      prompts: [join(packageDir, 'prompts')],
    });

    await expect(discoverPiclawPackages([packageDir])).resolves.toEqual({
      packages: [expect.objectContaining({ name: 'piclaw-wiki' })],
      extensionPaths: [join(packageDir, 'extensions')],
      skillPaths: [join(packageDir, 'skills')],
      promptPaths: [join(packageDir, 'prompts')],
    });
  });
});
