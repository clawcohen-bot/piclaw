import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defaultAgentMode, formatAgentMode, isAgentMode, readAgentMode, writeAgentMode } from '../mode';
import { getChatModePath } from '../storage';

const originalCwd = process.cwd();
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'mode-test-'));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('mode helpers', () => {
  it('validates and formats modes', () => {
    expect(defaultAgentMode).toBe('agent');
    expect(isAgentMode('agent')).toBe(true);
    expect(isAgentMode('ask')).toBe(true);
    expect(isAgentMode('bad')).toBe(false);
    expect(formatAgentMode('agent')).toBe('agent (full access)');
    expect(formatAgentMode('ask')).toBe('ask (read-only)');
  });

  it('reads default, persisted, and invalid modes', async () => {
    expect(await readAgentMode(1)).toBe('agent');
    await writeAgentMode(1, 'ask');
    expect(await readFile(getChatModePath(1), 'utf8')).toBe('ask\n');
    expect(await readAgentMode(1)).toBe('ask');
    await writeFile(getChatModePath(1), 'invalid\n');
    expect(await readAgentMode(1)).toBe('agent');
  });
});
