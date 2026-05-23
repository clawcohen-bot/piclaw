import { describe, expect, it, vi, beforeEach } from 'vitest';

const createAgentSessionMock = vi.hoisted(() => vi.fn());
const createServerToolsMock = vi.hoisted(() => vi.fn(() => ['server-tool']));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: createAgentSessionMock,
  SessionManager: { inMemory: vi.fn(() => ({ kind: 'memory' })) },
  ModelRegistry: {},
}));

vi.mock('../server-tools', () => ({
  createServerTools: createServerToolsMock,
}));

import { compactTelegramContext, runPiTask } from '../pi-task';

const makeSession = () => {
  let listener: ((event: any) => void) | undefined;
  return {
    session: {
      subscribe: vi.fn((callback: (event: any) => void) => {
        listener = callback;
        return vi.fn();
      }),
      prompt: vi.fn(async () => {
        listener?.({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'hello ' } });
        listener?.({ type: 'tool_execution_start', toolCallId: 'tool-1', toolName: 'read' });
        listener?.({ type: 'tool_execution_end', toolCallId: 'tool-1' });
        listener?.({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'world' } });
      }),
      agent: { waitForIdle: vi.fn(async () => undefined) },
      dispose: vi.fn(),
    },
  };
};

beforeEach(() => {
  createAgentSessionMock.mockReset();
  createServerToolsMock.mockClear();
});

describe('runPiTask', () => {
  it('creates an agent session with read-only tools in ask mode and returns streamed output', async () => {
    const session = makeSession();
    createAgentSessionMock.mockResolvedValue(session);
    const onToolStart = vi.fn(async () => undefined);
    const onToolEnd = vi.fn(async () => undefined);

    const output = await runPiTask({
      rootPath: '/repo',
      prompt: 'do it',
      shortMemory: [{ role: 'user', text: 'last', timestamp: 'now', rootId: 'root', messageId: 1 }],
      memory: 'memory',
      sessionSummary: 'summary',
      mode: 'ask',
      onToolStart,
      onToolEnd,
    });

    expect(output).toBe('hello world');
    expect(createAgentSessionMock).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/repo', tools: expect.not.arrayContaining(['server_bash']), customTools: ['server-tool'] }));
    expect(session.session.prompt).toHaveBeenCalledWith(expect.stringContaining('Mode: ask'));
    expect(onToolStart).toHaveBeenCalledWith('tool-1', 'read');
    expect(onToolEnd).toHaveBeenCalledWith('tool-1');
    expect(session.session.dispose).toHaveBeenCalledOnce();
  });

  it('includes write tools in agent mode and falls back to Done for empty output', async () => {
    const session = makeSession();
    session.session.prompt.mockImplementation(async () => undefined);
    createAgentSessionMock.mockResolvedValue(session);

    await expect(runPiTask({ rootPath: '/repo', prompt: 'do it', shortMemory: [], memory: '', sessionSummary: '', mode: 'agent', onToolStart: vi.fn(), onToolEnd: vi.fn() })).resolves.toBe('Done.');
    expect(createAgentSessionMock).toHaveBeenCalledWith(expect.objectContaining({ tools: expect.arrayContaining(['server_bash', 'server_write_file', 'server_edit_replace']) }));
  });
});

describe('compactTelegramContext', () => {
  it('returns existing summary when there are no messages', async () => {
    await expect(compactTelegramContext({ rootPath: '/repo', existingSummary: 'same', messages: [] })).resolves.toBe('same');
    expect(createAgentSessionMock).not.toHaveBeenCalled();
  });

  it('compacts messages through a no-tool session', async () => {
    const session = makeSession();
    createAgentSessionMock.mockResolvedValue(session);
    await expect(compactTelegramContext({ rootPath: '/repo', existingSummary: '', messages: [{ role: 'bot', text: 'done', timestamp: 'now', rootId: 'root', messageId: 1 }] })).resolves.toBe('hello world');
    expect(createAgentSessionMock).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/repo', tools: [], customTools: [] }));
  });
});
