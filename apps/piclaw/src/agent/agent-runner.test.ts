import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../core/config';
import type { ShortMemoryMessage } from '../memory/memory';

const compactTelegramContextMock = vi.fn();
const runPiTaskMock = vi.fn(() => new Promise<string>(() => undefined));
const readShortMemoryMock = vi.fn();
const writeSessionSummaryMock = vi.fn();
const writeShortMemoryMock = vi.fn();

vi.mock('./pi-task', () => ({
  compactTelegramContext: compactTelegramContextMock,
  runPiTask: runPiTaskMock,
}));

vi.mock('../memory/memory', () => ({
  addShortMemoryMessage: vi.fn(),
  readMarkdownMemory: vi.fn(async () => ''),
  readSessionSummary: vi.fn(async () => 'old summary'),
  readShortMemory: readShortMemoryMock,
  writeMarkdownMemory: vi.fn(),
  writeSessionSummary: writeSessionSummaryMock,
  writeShortMemory: writeShortMemoryMock,
}));

vi.mock('./mode', () => ({
  readAgentMode: vi.fn(async () => 'agent'),
}));

vi.mock('./model', () => ({
  readSelectedModel: vi.fn(async () => undefined),
}));

vi.mock('../memory/auto-memory', () => ({
  reviewTelegramMemory: vi.fn(),
  shouldReviewMemory: vi.fn(() => false),
}));

vi.mock('./usage', () => ({
  buildPiTaskContext: vi.fn(() => ''),
  calculateContextUsage: vi.fn(() => ({ usedTokens: 0, maxTokens: 100, percent: 0 })),
  formatContextWarning: vi.fn(() => ''),
  getUsageWarningLevel: vi.fn(() => undefined),
  readWarnedUsageLevels: vi.fn(async () => []),
  writeWarnedUsageLevels: vi.fn(),
}));

const { createAgentRunner } = await import('./agent-runner');

const config: AppConfig = {
  telegram: { enabled: true, allowedUserIds: [] },
  slack: { enabled: false, allowedUserIds: [] },
  devCli: { enabled: false },
  rootPath: '/repo',
  server: { services: [], logFiles: [] },
  voice: { whisperCommand: 'whisper', whisperModel: 'model', ffmpegCommand: 'ffmpeg', extraArgs: [], timeoutMs: 1 },
};

const makeMessage = (index: number): ShortMemoryMessage => ({
  role: index % 2 === 0 ? 'user' : 'bot',
  text: `message ${index}`,
  timestamp: 'now',
  rootId: 'server-root',
  messageId: index,
});

describe('createAgentRunner', () => {
  it('shows typing while compacting context before a task starts', async () => {
    const shortMemory = Array.from({ length: 21 }, (_, index) => makeMessage(index));
    readShortMemoryMock.mockResolvedValue(shortMemory);

    let typing = false;
    compactTelegramContextMock.mockImplementation(async () => {
      expect(typing).toBe(true);
      return 'new summary';
    });

    const startTyping = vi.fn(() => {
      typing = true;
      return () => {
        typing = false;
      };
    });

    const runner = createAgentRunner(config);
    await runner.submitTask({
      conversationKey: 'telegram:1:1',
      messageId: 1,
      text: 'hello',
      callbacks: {
        sendReply: vi.fn(),
        sendFormattedReply: vi.fn(),
        startTyping,
        onToolStart: vi.fn(),
        onToolEnd: vi.fn(),
        onBusy: vi.fn(),
        onQueuedStart: vi.fn(),
      },
    });

    expect(compactTelegramContextMock).toHaveBeenCalledOnce();
    expect(writeSessionSummaryMock).toHaveBeenCalledWith('new summary');
    expect(writeShortMemoryMock).toHaveBeenCalledWith(
      'telegram:1:1',
      'server-root',
      shortMemory.slice(-15),
    );
    expect(startTyping).toHaveBeenCalled();
  });
});
