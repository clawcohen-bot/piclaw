import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getObsidianVaultDir } from '../storage';
import {
  addWikiNote,
  ensureWikiVault,
  formatWikiOpen,
  formatWikiSearchResults,
  formatWikiStatus,
  searchWiki,
  slugifyWikiTitle,
} from '../wiki';

const originalCwd = process.cwd();
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'wiki-test-'));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('wiki vault', () => {
  it('creates an Obsidian-friendly vault structure', async () => {
    const vaultDir = await ensureWikiVault();

    expect(vaultDir).toBe(getObsidianVaultDir());
    await expect(readFile(join(vaultDir, 'index.md'), 'utf8')).resolves.toContain('Piclaw Obsidian Wiki');
    await expect(readFile(join(vaultDir, 'log.md'), 'utf8')).resolves.toContain('Wiki Log');
    await expect(formatWikiStatus()).resolves.toContain('Obsidian wiki is ready.');
  });

  it('adds raw and inbox notes and searches them', async () => {
    const result = await addWikiNote('Slack connector should support buttons later.', 'test');

    expect(result.rawPath).toMatch(/^Raw\//);
    expect(result.inboxPath).toMatch(/^Inbox\//);

    const raw = await readFile(join(getObsidianVaultDir(), result.rawPath), 'utf8');
    const inbox = await readFile(join(getObsidianVaultDir(), result.inboxPath), 'utf8');
    const log = await readFile(join(getObsidianVaultDir(), 'log.md'), 'utf8');

    expect(raw).toContain('type: raw-note');
    expect(inbox).toContain('Source: [[Raw/');
    expect(log).toContain(`[[${result.inboxPath}]]`);

    const results = await searchWiki('Slack connector');
    expect(results.some((item) => item.path === result.rawPath || item.path === result.inboxPath)).toBe(true);
    expect(formatWikiSearchResults('Slack connector', results)).toContain('Wiki matches for: Slack connector');
    await expect(formatWikiOpen('Slack connector')).resolves.toContain('Best wiki match:');
  });

  it('handles empty inputs', async () => {
    expect(slugifyWikiTitle('')).toBe('note');
    await expect(addWikiNote('   ')).rejects.toThrow('Wiki note text is required');
    await expect(searchWiki('   ')).resolves.toEqual([]);
    expect(formatWikiSearchResults('', [])).toBe('Use /wiki-search <query>');
    await expect(formatWikiOpen('')).resolves.toBe('Use /wiki-open <query>');
  });
});
