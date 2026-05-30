import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { getObsidianVaultDir } from '../../core/storage';

const wikiDirectories = ['Inbox', 'Raw', 'People', 'Projects', 'Topics', 'Decisions', 'Daily'] as const;
const maxSearchFileBytes = 200_000;
const maxSearchResults = 10;

export type WikiSearchResult = {
  path: string;
  title: string;
  excerpt: string;
};

const nowIso = (): string => new Date().toISOString();

export const getWikiDirectories = (): readonly string[] => wikiDirectories;

export const slugifyWikiTitle = (value: string): string => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9א-ת]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'note';
};

const titleFromPath = (path: string): string => basename(path, '.md');

const ensureCoreFiles = async (): Promise<void> => {
  const vaultDir = getObsidianVaultDir();
  await mkdir(vaultDir, { recursive: true });

  await Promise.all(wikiDirectories.map((directory) => mkdir(join(vaultDir, directory), { recursive: true })));

  await writeFile(
    join(vaultDir, 'index.md'),
    [
      '# Piclaw Obsidian Wiki',
      '',
      'Open this folder as an Obsidian vault.',
      '',
      'Main folders:',
      ...wikiDirectories.map((directory) => `- [[${directory}]]`),
      '',
    ].join('\n'),
    { flag: 'wx' },
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  });

  await writeFile(join(vaultDir, 'log.md'), '# Wiki Log\n\n', { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  });
};

export const ensureWikiVault = async (): Promise<string> => {
  await ensureCoreFiles();
  return getObsidianVaultDir();
};

const listMarkdownFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listMarkdownFiles(path);
      }
      return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    }),
  );

  return nested.flat();
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const makeExcerpt = (content: string, query: string): string => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const index = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return normalized.slice(0, 180);
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(normalized.length, index + query.length + 120);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`;
};

export const searchWiki = async (query: string): Promise<WikiSearchResult[]> => {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  await ensureWikiVault();
  const vaultDir = getObsidianVaultDir();
  const files = await listMarkdownFiles(vaultDir);
  const matcher = new RegExp(escapeRegExp(trimmed), 'i');
  const results: WikiSearchResult[] = [];

  for (const file of files) {
    const fileStat = await stat(file);
    if (fileStat.size > maxSearchFileBytes) {
      continue;
    }

    const content = await readFile(file, 'utf8');
    if (!matcher.test(content) && !matcher.test(titleFromPath(file))) {
      continue;
    }

    results.push({
      path: relative(vaultDir, file),
      title: titleFromPath(file),
      excerpt: makeExcerpt(content, trimmed),
    });

    if (results.length >= maxSearchResults) {
      break;
    }
  }

  return results;
};

export const formatWikiSearchResults = (query: string, results: WikiSearchResult[]): string => {
  if (query.trim().length === 0) {
    return 'Use /wiki-search <query>';
  }

  if (results.length === 0) {
    return `No wiki matches for: ${query.trim()}`;
  }

  return [
    `Wiki matches for: ${query.trim()}`,
    '',
    ...results.flatMap((result, index) => [
      `${index + 1}. ${result.path}`,
      result.excerpt.length === 0 ? '(empty)' : result.excerpt,
      '',
    ]),
  ].join('\n').trim();
};

export const addWikiNote = async (text: string, source = 'manual'): Promise<{ rawPath: string; inboxPath: string }> => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('Wiki note text is required');
  }

  await ensureWikiVault();
  const vaultDir = getObsidianVaultDir();
  const timestamp = nowIso();
  const stamp = timestamp.replace(/[:.]/g, '-');
  const slug = slugifyWikiTitle(trimmed.split('\n')[0] ?? 'note');
  const rawRelativePath = join('Raw', `${stamp}-${slug}.md`);
  const inboxRelativePath = join('Inbox', `${stamp}-${slug}.md`);
  const rawPath = join(vaultDir, rawRelativePath);
  const inboxPath = join(vaultDir, inboxRelativePath);

  const rawContent = ['---', `created: ${timestamp}`, `source: ${source}`, 'type: raw-note', '---', '', trimmed, ''].join('\n');
  const inboxContent = [
    '---',
    `created: ${timestamp}`,
    `source: ${source}`,
    'type: inbox-note',
    `raw: "[[${rawRelativePath.replace(/\\/g, '/')}]]"`,
    '---',
    '',
    `Source: [[${rawRelativePath.replace(/\\/g, '/')}]]`,
    '',
    trimmed,
    '',
  ].join('\n');

  await writeFile(rawPath, rawContent, 'utf8');
  await writeFile(inboxPath, inboxContent, 'utf8');
  await appendFile(join(vaultDir, 'log.md'), `- ${timestamp} added note from ${source}: [[${inboxRelativePath.replace(/\\/g, '/')}]]\n`, 'utf8');

  return { rawPath: rawRelativePath.replace(/\\/g, '/'), inboxPath: inboxRelativePath.replace(/\\/g, '/') };
};

export const formatWikiStatus = async (): Promise<string> => {
  const vaultDir = await ensureWikiVault();
  const files = await listMarkdownFiles(vaultDir);

  return [
    'Obsidian wiki is ready.',
    `Vault: ${vaultDir}`,
    `Markdown files: ${files.length}`,
    '',
    'Commands:',
    '/wiki-add <text>',
    '/wiki-search <query>',
    '/wiki-open <query>',
  ].join('\n');
};

export const formatWikiOpen = async (query: string): Promise<string> => {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return 'Use /wiki-open <query>';
  }

  const [result] = await searchWiki(trimmed);
  if (result === undefined) {
    return `No wiki page found for: ${trimmed}`;
  }

  return [`Best wiki match:`, result.path, `Obsidian link: [[${result.title}]]`].join('\n');
};
