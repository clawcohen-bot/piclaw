import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { parseConfig } from './config';
import { createPiclawRuntime } from './runtime';
import { loadExtensions } from './extensions';
import { discoverPiclawPackages } from '../features/packages/package-discovery';

const createRuntime = () => createPiclawRuntime(parseConfig({
  telegram: { allowedUserIds: [] },
  devCli: { enabled: true },
  rootPath: '.',
  server: { services: [], logFiles: [] },
  extensions: [],
  packages: [],
  models: { providers: {} },
}));

describe('local Piclaw packages', () => {
  it('load wiki, calendar, and voice commands through package extensions', async () => {
    const runtime = createRuntime();
    const resources = await discoverPiclawPackages([
      resolve(process.cwd(), 'packages/piclaw-wiki'),
      resolve(process.cwd(), 'packages/piclaw-calendar-google'),
      resolve(process.cwd(), 'packages/piclaw-voice'),
    ]);

    await loadExtensions(resources.extensionPaths, runtime.api, { failFast: true });

    expect(runtime.commands.get('wiki')).toBeDefined();
    expect(runtime.commands.get('wiki-add')).toBeDefined();
    expect(runtime.commands.get('calendar')).toBeDefined();
    expect(runtime.commands.get('calendar-add')).toBeDefined();
    expect(runtime.commands.get('voice')).toBeDefined();
    expect(runtime.tools.get('wiki.add-note')).toBeDefined();
    expect(runtime.tools.get('calendar.list-events')).toBeDefined();
    expect(runtime.tools.get('voice.transcribe-telegram-file')).toBeDefined();
  });

  it('keeps Telegram free of direct wiki, calendar, and voice feature imports', async () => {
    const source = await readFile(resolve(process.cwd(), 'apps/piclaw/src/connectors/telegram/runtime-handlers.ts'), 'utf8');

    expect(source).not.toContain("../wiki/wiki");
    expect(source).not.toContain("../calendar/google-calendar");
    expect(source).not.toContain("../voice/voice");
  });

  it('keeps packages behind the public Piclaw SDK boundary', async () => {
    const packageRoot = resolve(process.cwd(), 'packages');
    const packageNames = await readdir(packageRoot);

    for (const packageName of packageNames) {
      const extensionPath = join(packageRoot, packageName, 'extensions', 'index.ts');
      const source = await readFile(extensionPath, 'utf8').catch(() => '');

      expect(source).not.toContain('apps/piclaw/src');
      expect(source).not.toContain('../../../apps/');
    }
  });
});
