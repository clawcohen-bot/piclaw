import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatPackagesList, getAvailablePackages, getPiSettingsPath } from './packages';
import { ensureAppDirs } from '../../core/storage';

const originalCwd = process.cwd();
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'packages-test-'));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('packages helpers', () => {
  it('returns empty packages for missing or invalid settings', async () => {
    expect(getPiSettingsPath()).toBe(join(process.cwd(), 'data', 'piclaw', 'settings.json'));
    expect(await getAvailablePackages()).toEqual([]);
    expect(await formatPackagesList()).toBe('Packages:\n  none');

    await ensureAppDirs();
    await writeFile(getPiSettingsPath(), JSON.stringify({ packages: [1] }));
    expect(await getAvailablePackages()).toEqual([]);
  });

  it('sorts and formats packages', async () => {
    await ensureAppDirs();
    await writeFile(getPiSettingsPath(), JSON.stringify({ packages: ['zeta', 'alpha'] }));
    expect(await getAvailablePackages()).toEqual(['alpha', 'zeta']);
    expect(await formatPackagesList()).toBe('Packages:\n  - alpha\n  - zeta');
  });
});
