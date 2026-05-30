import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addShortMemoryMessage,
  clearMarkdownMemory,
  clearSessionSummary,
  clearShortMemory,
  readMarkdownMemory,
  readSessionSummary,
  readShortMemory,
  remember,
  writeMarkdownMemory,
  writeSessionSummary,
  writeShortMemory,
  type ShortMemoryMessage,
} from './memory';
import { getAppDir, getMemoryPath, getShortMemoryPath } from '../core/storage';

const originalCwd = process.cwd();
let tempDir: string;

const message = (index: number): ShortMemoryMessage => ({
  role: index % 2 === 0 ? 'user' : 'bot',
  text: `message ${index}`,
  timestamp: '2026-01-01T00:00:00.000Z',
  rootId: 'root',
  messageId: index,
});

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'memory-test-'));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('short memory', () => {
  it('returns empty memory for missing, invalid, or non-array files', async () => {
    expect(await readShortMemory(1, 'root')).toEqual([]);
    await writeFile(getShortMemoryPath(1, 'root'), '{}').catch(async () => {
      await writeShortMemory(1, 'root', []);
      await writeFile(getShortMemoryPath(1, 'root'), '{}');
    });
    expect(await readShortMemory(1, 'root')).toEqual([]);
    await writeFile(getShortMemoryPath(1, 'root'), JSON.stringify([{ role: 'bad' }, message(1)]));
    expect(await readShortMemory(1, 'root')).toEqual([message(1)]);
  });

  it('writes, appends, limits, and clears short memory', async () => {
    await writeShortMemory(1, 'root', Array.from({ length: 35 }, (_, index) => message(index)));
    expect(await readShortMemory(1, 'root')).toHaveLength(30);
    expect((await readShortMemory(1, 'root'))[0]?.messageId).toBe(5);
    await addShortMemoryMessage(1, message(99));
    expect((await readShortMemory(1, 'root')).at(-1)).toEqual(message(99));
    await clearShortMemory(1, 'root');
    expect(await readFile(getShortMemoryPath(1, 'root'), 'utf8')).toBe('[]\n');
  });
});

describe('markdown memory and summaries', () => {
  it('reads missing files as empty strings and writes trimmed summaries', async () => {
    expect(await readMarkdownMemory()).toBe('');
    expect(await readSessionSummary()).toBe('');
    await writeSessionSummary('  hello  ');
    expect(await readSessionSummary()).toBe('hello\n');
    await clearSessionSummary();
    expect(await readSessionSummary()).toBe('');
  });

  it('appends remembered text with an ISO timestamp', async () => {
    await remember('keep this');
    const content = await readFile(getMemoryPath(), 'utf8');
    expect(content).toMatch(/^- \d{4}-\d{2}-\d{2}T.*: keep this\n$/);
    expect(getAppDir()).toContain('piclaw');
  });

  it('writes and clears saved markdown memory', async () => {
    await writeMarkdownMemory('  - keep this  ');
    expect(await readMarkdownMemory()).toBe('- keep this\n');
    await remember('remove this');
    expect(await readMarkdownMemory()).toContain('remove this');
    await clearMarkdownMemory();
    expect(await readMarkdownMemory()).toBe('');
  });
});
