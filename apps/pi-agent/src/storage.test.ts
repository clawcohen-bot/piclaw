import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ensureAppDirs,
  ensureParentDir,
  getAppDir,
  getAuditLogPath,
  getChatModePath,
  getMemoryPath,
  getPiAgentDir,
  getSessionSummaryPath,
  getShortMemoryPath,
} from './storage';

const originalCwd = process.cwd();
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'storage-test-'));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('storage paths', () => {
  it('builds app and pi storage paths under cwd', () => {
    expect(getAppDir()).toBe(join(tempDir, 'data', 'pi-agent'));
    expect(getPiAgentDir()).toBe(join(tempDir, 'data', 'pi'));
    expect(getMemoryPath()).toBe(join(getAppDir(), 'memory.md'));
    expect(getSessionSummaryPath()).toBe(join(getAppDir(), 'summary.md'));
    expect(getShortMemoryPath(7, 'root')).toBe(join(getAppDir(), 'short-memory', '7-root.json'));
    expect(getAuditLogPath()).toBe(join(getAppDir(), 'audit.jsonl'));
    expect(getChatModePath(7)).toBe(join(getAppDir(), 'modes', '7.txt'));
  });

  it('creates parent and app directories', async () => {
    const nested = join(tempDir, 'a', 'b', 'file.txt');
    await ensureParentDir(nested);
    await writeFile(nested, 'ok');
    await expect(readFile(nested, 'utf8')).resolves.toBe('ok');

    await ensureAppDirs();
    await writeFile(join(getPiAgentDir(), 'skills', 'skill.txt'), 'ok');
    await writeFile(join(getAppDir(), 'models', '1.json'), '{}');
    await expect(readFile(join(getPiAgentDir(), 'skills', 'skill.txt'), 'utf8')).resolves.toBe('ok');
  });
});
