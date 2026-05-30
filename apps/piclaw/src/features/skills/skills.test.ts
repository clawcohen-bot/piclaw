import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadSkillsMock = vi.hoisted(() => vi.fn());

vi.mock('@earendil-works/pi-coding-agent', () => ({
  loadSkills: loadSkillsMock,
}));

import { formatSkillsList, formatSkillsStatusList, formatSkillsTelegramHtml, getAvailableSkillSummaries } from './skills';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'skills-test-'));
  loadSkillsMock.mockReset();
  loadSkillsMock.mockReturnValue({
    skills: [
      { name: 'zeta', description: 'last' },
      { name: 'alpha', description: 'first' },
    ],
  });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('skills helpers', () => {
  it('loads default and repo skills and sorts summaries', async () => {
    await mkdir(join(tempDir, '.agents', 'skills'), { recursive: true });
    expect(existsSync(join(tempDir, '.agents', 'skills'))).toBe(true);
    expect(getAvailableSkillSummaries(tempDir)).toEqual([
      { name: 'alpha', description: 'first' },
      { name: 'zeta', description: 'last' },
    ]);
    expect(loadSkillsMock).toHaveBeenCalledWith(expect.objectContaining({ cwd: tempDir, includeDefaults: true, skillPaths: [join(tempDir, '.agents', 'skills')] }));
  });

  it('formats normal and empty skill lists', () => {
    expect(formatSkillsList(tempDir)).toBe('Available skills:\n\nalpha\n  first\n\nzeta\n  last');
    expect(formatSkillsTelegramHtml(tempDir)).toBe('Available skills:\n\n<b>alpha</b>\n<pre>first</pre>\n\n<b>zeta</b>\n<pre>last</pre>');
    expect(formatSkillsStatusList(tempDir)).toBe('Skills:\n  - alpha\n    first\n  - zeta\n    last');

    loadSkillsMock.mockReturnValue({ skills: [] });
    expect(formatSkillsList(tempDir)).toBe('No skills found.');
    expect(formatSkillsTelegramHtml(tempDir)).toBe('No skills found.');
    expect(formatSkillsStatusList(tempDir)).toBe('Skills:\n  none');
  });

  it('escapes Telegram HTML in skill names and descriptions', () => {
    loadSkillsMock.mockReturnValue({ skills: [{ name: 'a<b', description: 'use x & y' }] });

    expect(formatSkillsTelegramHtml(tempDir)).toBe('Available skills:\n\n<b>a&lt;b</b>\n<pre>use x &amp; y</pre>');
  });
});
