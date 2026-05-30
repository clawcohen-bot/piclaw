import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildPiTaskContext,
  calculateContextUsage,
  clearWarnedUsageLevels,
  estimateTokens,
  formatContextUsage,
  getModelContextLimit,
  getUsageWarningLevel,
  readWarnedUsageLevels,
  writeWarnedUsageLevels,
} from './usage';

type TestModel = Parameters<typeof getModelContextLimit>[0];

let cwd: string | undefined;
let tempDir: string | undefined;

const useTempCwd = async (): Promise<void> => {
  cwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), 'piclaw-usage-'));
  process.chdir(tempDir);
};

afterEach(async () => {
  if (cwd !== undefined) {
    process.chdir(cwd);
    cwd = undefined;
  }
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('usage', () => {
  it('builds the same prompt context shape used for Pi tasks', () => {
    const context = buildPiTaskContext({
      rootPath: '/repo',
      prompt: 'fix it',
      model: { provider: 'openai', id: 'gpt-4o' } as TestModel,
      shortMemory: [
        { role: 'user', text: 'hello', timestamp: 'now', rootId: 'root', messageId: 1 },
        { role: 'bot', text: 'hi', timestamp: 'now', rootId: 'root', messageId: 2 },
      ],
      memory: '- remembered',
      sessionSummary: '- summary',
      mode: 'agent',
    });

    expect(context).toContain('Root path: /repo');
    expect(context).toContain('Model: openai/gpt-4o');
    expect(context).toContain('user: hello\nbot: hi');
    expect(context).toContain('User task:\nfix it');
    expect(context).toContain('Agent mode has full access.');
  });

  it('estimates tokens and formats known limits', () => {
    expect(estimateTokens('12345')).toBe(2);

    const usage = calculateContextUsage('a'.repeat(100), { contextWindow: 1000 } as TestModel);

    expect(usage).toEqual({ usedTokens: 25, limitTokens: 1000, remainingTokens: 975, percentUsed: 3 });
    expect(formatContextUsage(usage, { provider: 'openai', id: 'gpt-4o' } as TestModel)).toBe(
      ['Estimated context usage:', '- Model: openai/gpt-4o', '- Used: 25 tokens', '- Limit: 1,000 tokens', '- Remaining: 975 tokens', '- Used: 3%'].join('\n'),
    );
  });

  it('formats unknown limits without percent or remaining', () => {
    const usage = calculateContextUsage('a'.repeat(8), undefined);

    expect(usage).toEqual({ usedTokens: 2 });
    expect(formatContextUsage(usage)).toBe(['Estimated context usage:', '- Model: Pi default', '- Used: 2 tokens', '- Limit: context limit unknown'].join('\n'));
    expect(getUsageWarningLevel(usage)).toBeUndefined();
  });

  it('uses fallback model limits when contextWindow is missing', () => {
    expect(getModelContextLimit({ provider: 'openai', id: 'gpt-4o' } as TestModel)).toBe(128000);
    expect(getModelContextLimit({ provider: 'unknown', id: 'model' } as TestModel)).toBeUndefined();
  });

  it('picks the highest crossed warning level', () => {
    expect(getUsageWarningLevel({ usedTokens: 70, limitTokens: 100, remainingTokens: 30, percentUsed: 70 })).toBe(70);
    expect(getUsageWarningLevel({ usedTokens: 90, limitTokens: 100, remainingTokens: 10, percentUsed: 90 })).toBe(85);
    expect(getUsageWarningLevel({ usedTokens: 96, limitTokens: 100, remainingTokens: 4, percentUsed: 96 })).toBe(95);
  });

  it('persists warned levels per chat', async () => {
    await useTempCwd();

    expect(await readWarnedUsageLevels(123)).toEqual([]);
    await writeWarnedUsageLevels(123, [85, 70, 85]);
    expect(await readWarnedUsageLevels(123)).toEqual([70, 85]);
    await clearWarnedUsageLevels(123);
    expect(await readWarnedUsageLevels(123)).toEqual([]);
  });
});
