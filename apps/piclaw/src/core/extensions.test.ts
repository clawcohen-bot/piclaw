import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseConfig } from './config';
import { discoverExtensionFiles, getDefaultExtensionPaths, loadExtensionFile, loadExtensions } from './extensions';
import { createPiclawRuntime } from './runtime';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'extensions-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const createRuntime = () => createPiclawRuntime(parseConfig({
  telegram: { enabled: false, allowedUserIds: [] },
  devCli: { enabled: true },
  rootPath: tempDir,
  server: { services: [], logFiles: [] },
}), { error: vi.fn(), warn: vi.fn(), info: vi.fn() });

describe('extension loader', () => {
  it('discovers and loads TypeScript extensions', async () => {
    const extensionDir = join(tempDir, '.piclaw', 'extensions');
    await mkdir(extensionDir, { recursive: true });
    await writeFile(join(extensionDir, 'hello.ts'), `
      export default function (piclaw) {
        piclaw.registerCommand({ name: 'hello', description: 'hello command', handler: () => 'hi' })
        piclaw.registerTool({ name: 'answer', description: 'answer tool', handler: () => 42 })
        piclaw.on('connector_message', () => ({ patch: { text: 'changed' } }))
      }
    `);

    const runtime = createRuntime();
    await expect(discoverExtensionFiles([extensionDir])).resolves.toEqual([join(extensionDir, 'hello.ts')]);
    await expect(loadExtensions([extensionDir], runtime.api, { failFast: true })).resolves.toEqual([
      { path: join(extensionDir, 'hello.ts'), loaded: true },
    ]);

    expect(runtime.commands.get('hello')?.description).toBe('hello command');
    await expect(runtime.tools.call('answer', {})).resolves.toBe(42);
    await expect(runtime.events.dispatch('connector_message', {
      connector: 'test',
      userId: 'u',
      conversationId: 'c',
      messageId: 'm',
      text: 'original',
      timestamp: 'now',
    })).resolves.toMatchObject({ event: { text: 'changed' } });
  });

  it('reports extension load errors unless failFast is enabled', async () => {
    const extensionDir = join(tempDir, 'extensions');
    await mkdir(extensionDir, { recursive: true });
    const badPath = join(extensionDir, 'bad.ts');
    await writeFile(badPath, 'export const notDefault = 1');
    await writeFile(join(extensionDir, 'ignore.txt'), 'no');

    const runtime = createRuntime();
    await expect(loadExtensions([extensionDir], runtime.api)).resolves.toMatchObject([
      { path: badPath, loaded: false },
    ]);
    await expect(loadExtensions([extensionDir], runtime.api, { failFast: true })).rejects.toThrow('default function');
    await expect(loadExtensionFile(badPath, runtime.api)).rejects.toThrow('default function');
  });

  it('returns global and project default extension paths', () => {
    expect(getDefaultExtensionPaths(tempDir)).toContain(join(tempDir, '.piclaw', 'extensions'));
  });
});
