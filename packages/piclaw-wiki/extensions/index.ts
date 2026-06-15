import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import type { PiclawExtensionAPI } from '@piclaw/sdk';

const source = 'telegram';
const wikiDirectories = ['Inbox', 'Raw', 'People', 'Projects', 'Topics', 'Decisions', 'Daily'] as const;
const maxSearchFileBytes = 200_000;
const maxSearchResults = 10;

type WikiSearchResult = {
  path: string;
  title: string;
  excerpt: string;
};

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const truncateText = (value: string, maxLength: number): string => value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
const nowIso = (): string => new Date().toISOString();

const slugifyWikiTitle = (value: string): string => {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9א-ת]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return slug || 'note';
};

const titleFromPath = (path: string): string => basename(path, '.md');

const ensureWikiVault = async (piclaw: PiclawExtensionAPI): Promise<string> => {
  const vaultDir = piclaw.storage.obsidianVaultPath();
  await mkdir(vaultDir, { recursive: true });
  await Promise.all(wikiDirectories.map((directory) => mkdir(join(vaultDir, directory), { recursive: true })));

  await writeFile(join(vaultDir, 'index.md'), [
    '# Piclaw Obsidian Wiki',
    '',
    'Open this folder as an Obsidian vault.',
    '',
    'Main folders:',
    ...wikiDirectories.map((directory) => `- [[${directory}]]`),
    '',
  ].join('\n'), { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });

  await writeFile(join(vaultDir, 'log.md'), '# Wiki Log\n\n', { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });

  return vaultDir;
};

const listMarkdownFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });

  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  }));

  return nested.flat();
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const makeExcerpt = (content: string, query: string): string => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const index = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return normalized.slice(0, 180);
  const start = Math.max(0, index - 60);
  const end = Math.min(normalized.length, index + query.length + 120);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`;
};

const searchWiki = async (piclaw: PiclawExtensionAPI, query: string): Promise<WikiSearchResult[]> => {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const vaultDir = await ensureWikiVault(piclaw);
  const files = await listMarkdownFiles(vaultDir);
  const matcher = new RegExp(escapeRegExp(trimmed), 'i');
  const results: WikiSearchResult[] = [];

  for (const file of files) {
    const fileStat = await stat(file);
    if (fileStat.size > maxSearchFileBytes) continue;

    const content = await readFile(file, 'utf8');
    if (!matcher.test(content) && !matcher.test(titleFromPath(file))) continue;

    results.push({ path: relative(vaultDir, file), title: titleFromPath(file), excerpt: makeExcerpt(content, trimmed) });
    if (results.length >= maxSearchResults) break;
  }

  return results;
};

const formatWikiSearchResults = (query: string, results: WikiSearchResult[]): string => {
  if (query.trim().length === 0) return 'Use /wiki-search <query>';
  if (results.length === 0) return `No wiki matches for: ${query.trim()}`;
  return [`Wiki matches for: ${query.trim()}`, '', ...results.flatMap((result, index) => [`${index + 1}. ${result.path}`, result.excerpt.length === 0 ? '(empty)' : result.excerpt, ''])].join('\n').trim();
};

const addWikiNote = async (piclaw: PiclawExtensionAPI, text: string, noteSource = 'manual'): Promise<{ rawPath: string; inboxPath: string }> => {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error('Wiki note text is required');

  const vaultDir = await ensureWikiVault(piclaw);
  const timestamp = nowIso();
  const stamp = timestamp.replace(/[:.]/g, '-');
  const slug = slugifyWikiTitle(trimmed.split('\n')[0] ?? 'note');
  const rawRelativePath = join('Raw', `${stamp}-${slug}.md`);
  const inboxRelativePath = join('Inbox', `${stamp}-${slug}.md`);

  const rawContent = ['---', `created: ${timestamp}`, `source: ${noteSource}`, 'type: raw-note', '---', '', trimmed, ''].join('\n');
  const inboxContent = ['---', `created: ${timestamp}`, `source: ${noteSource}`, 'type: inbox-note', `raw: "[[${rawRelativePath.replace(/\\/g, '/')}]]"`, '---', '', `Source: [[${rawRelativePath.replace(/\\/g, '/')}]]`, '', trimmed, ''].join('\n');

  await writeFile(join(vaultDir, rawRelativePath), rawContent, 'utf8');
  await writeFile(join(vaultDir, inboxRelativePath), inboxContent, 'utf8');
  await appendFile(join(vaultDir, 'log.md'), `- ${timestamp} added note from ${noteSource}: [[${inboxRelativePath.replace(/\\/g, '/')}]]\n`, 'utf8');

  return { rawPath: rawRelativePath.replace(/\\/g, '/'), inboxPath: inboxRelativePath.replace(/\\/g, '/') };
};

const formatWikiStatus = async (piclaw: PiclawExtensionAPI): Promise<string> => {
  const vaultDir = await ensureWikiVault(piclaw);
  const files = await listMarkdownFiles(vaultDir);
  return ['Obsidian wiki is ready.', `Vault: ${vaultDir}`, `Markdown files: ${files.length}`, '', 'Commands:', '/wiki-add <text>', '/wiki-search <query>', '/wiki-open <query>'].join('\n');
};

const formatWikiOpen = async (piclaw: PiclawExtensionAPI, query: string): Promise<string> => {
  const trimmed = query.trim();
  if (trimmed.length === 0) return 'Use /wiki-open <query>';
  const [result] = await searchWiki(piclaw, trimmed);
  if (result === undefined) return `No wiki page found for: ${trimmed}`;
  return ['Best wiki match:', result.path, `Obsidian link: [[${result.title}]]`].join('\n');
};

export default function (piclaw: PiclawExtensionAPI) {
  piclaw.registerTool({
    name: 'wiki.add-note',
    description: 'Add a note to the Piclaw Obsidian wiki.',
    handler: async (input: any) => addWikiNote(piclaw, String(input?.text ?? ''), String(input?.source ?? source)),
  });

  piclaw.registerTool({
    name: 'wiki.search',
    description: 'Search the Piclaw Obsidian wiki.',
    handler: async (input: any) => searchWiki(piclaw, String(input?.query ?? '')),
  });

  piclaw.registerCommand({ name: 'wiki', description: 'Show wiki status.', handler: () => formatWikiStatus(piclaw) });

  piclaw.registerCommand({
    name: 'wiki-add',
    description: 'Add text to the wiki inbox.',
    handler: async (input: any) => {
      if (input.args.length === 0) return 'Use /wiki-add <text>';
      try {
        const result = await addWikiNote(piclaw, input.args, source);
        return `Added to Obsidian wiki.\nInbox: ${result.inboxPath}\nRaw: ${result.rawPath}`;
      } catch (error) {
        return `Wiki add failed: ${getErrorMessage(error)}`;
      }
    },
  });

  piclaw.registerCommand({
    name: 'wiki-search',
    description: 'Search the wiki.',
    handler: async (input: any) => truncateText(formatWikiSearchResults(input.args, await searchWiki(piclaw, input.args)), 3500),
  });

  piclaw.registerCommand({ name: 'wiki-open', description: 'Find the best matching wiki page.', handler: async (input: any) => formatWikiOpen(piclaw, input.args) });
}
