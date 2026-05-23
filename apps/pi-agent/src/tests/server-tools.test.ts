import { exec } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ exec: vi.fn() }));

import { createServerTools } from '../server-tools';

const execMock = vi.mocked(exec);
const originalCwd = process.cwd();
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'tools-test-'));
  process.chdir(tempDir);
  execMock.mockReset();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('createServerTools', () => {
  it('creates bash, write, and exact edit tools', async () => {
    execMock.mockImplementation(((command: string, options: unknown, callback: (error: null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: `ran ${command}`, stderr: '' });
      return {} as never;
    }) as never);

    const [bash, write, edit] = createServerTools({ rootPath: tempDir }) as any[];
    expect(bash.name).toBe('server_bash');
    expect(write.name).toBe('server_write_file');
    expect(edit.name).toBe('server_edit_replace');

    expect(await bash.execute('1', { command: 'pwd' })).toMatchObject({ content: [{ text: 'ran pwd' }] });
    expect(execMock).toHaveBeenCalledWith('pwd', expect.objectContaining({ cwd: tempDir }), expect.any(Function));

    expect(await write.execute('2', { path: 'nested/file.txt', content: 'hello' })).toMatchObject({ content: [{ text: expect.stringContaining('nested/file.txt') }] });
    expect(await readFile(join(tempDir, 'nested/file.txt'), 'utf8')).toBe('hello');

    expect(await edit.execute('3', { path: 'nested/file.txt', oldText: 'hello', newText: 'bye' })).toMatchObject({ content: [{ text: expect.stringContaining('Edited') }] });
    expect(await readFile(join(tempDir, 'nested/file.txt'), 'utf8')).toBe('bye');
  });

  it('blocks missing and duplicate exact edit matches', async () => {
    const [, , edit] = createServerTools({ rootPath: tempDir }) as any[];
    await writeFile(join(tempDir, 'file.txt'), 'aa aa');
    expect(await edit.execute('1', { path: 'file.txt', oldText: 'missing', newText: 'x' })).toMatchObject({ content: [{ text: 'Old text was not found exactly once.' }] });
    expect(await edit.execute('2', { path: 'file.txt', oldText: 'aa', newText: 'x' })).toMatchObject({ content: [{ text: 'Old text appears more than once. Edit was blocked.' }] });
  });
});
