import { createAgentSession, ModelRegistry, SessionManager } from '@earendil-works/pi-coding-agent';

import type { ShortMemoryMessage } from './memory';
import type { AgentMode } from './mode';
import { createServerTools } from './server-tools';
import { getPiAgentDir } from './storage';

type PiModel = ReturnType<ModelRegistry['getAll']>[number];

type RunPiTaskInput = {
  rootPath: string;
  prompt: string;
  model?: PiModel;
  shortMemory: ShortMemoryMessage[];
  memory: string;
  sessionSummary: string;
  mode: AgentMode;
  onToolStart: (toolCallId: string, toolName: string) => Promise<void>;
  onToolEnd: (toolCallId: string) => Promise<void>;
};

export const runPiTask = async (input: RunPiTaskInput): Promise<string> => {
  const serverTools = createServerTools({ rootPath: input.rootPath });
  const webTools = ['web_search', 'fetch_content', 'get_search_content', 'code_search', 'web_fetch', 'batch_web_fetch'];
  const tools =
    input.mode === 'ask'
      ? ['read', 'grep', 'find', 'ls', ...webTools]
      : [
          'read',
          'grep',
          'find',
          'ls',
          'server_bash',
          'server_write_file',
          'server_edit_replace',
          ...webTools,
        ];

  const { session } = await createAgentSession({
    cwd: input.rootPath,
    agentDir: getPiAgentDir(),
    tools,
    model: input.model,
    customTools: serverTools,
    sessionManager: SessionManager.inMemory(),
  });

  let output = '';

  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      output += event.assistantMessageEvent.delta;
    }

    if (event.type === 'tool_execution_start') {
      void input.onToolStart(event.toolCallId, event.toolName);
    }

    if (event.type === 'tool_execution_end') {
      void input.onToolEnd(event.toolCallId);
    }
  });

  const context = [
    'Pi Agent context',
    '',
    `Root path: ${input.rootPath}`,
    `Mode: ${input.mode}`,
    `Model: ${input.model === undefined ? 'Pi default' : `${input.model.provider}/${input.model.id}`}`,
    '',
    'Memory:',
    input.memory || '(empty)',
    '',
    'Session summary:',
    input.sessionSummary || '(empty)',
    '',
    'Last Telegram messages:',
    input.shortMemory.slice(-15).map((message) => `${message.role}: ${message.text}`).join('\n') || '(empty)',
    '',
    'User task:',
    input.prompt,
    '',
    'Reply style:',
    '- Final answer goes to Telegram.',
    '- Use short, plain text.',
    '- Prefer simple bullets when helpful.',
    '- Avoid Markdown headings, tables, and decorative formatting.',
    '- Do not start lines with #, ##, or similar heading syntax.',
    '',
    'Important tool rules:',
    '- For reading/searching files, use normal read/grep/find/ls tools.',
    ...(input.mode === 'ask'
      ? [
          '- Ask mode is read-only. You may inspect files and answer only.',
          '- Do not run shell commands, write files, or edit files.',
          '- If changes are needed, explain what you would change instead of doing it.',
        ]
      : [
          '- Agent mode has full access.',
          '- For shell commands, use server_bash.',
          '- For file writes, use server_write_file.',
          '- For exact text edits, use server_edit_replace.',
          '- rootPath is only the starting/default directory. It is not a sandbox.',
          '- Piclaw has full system access by default. Use absolute paths when needed.',
        ]),
  ].join('\n');

  await session.prompt(context);
  await session.agent.waitForIdle();

  unsubscribe();
  session.dispose();

  return output.trim() || 'Done.';
};


export const compactTelegramContext = async (input: {
  rootPath: string;
  model?: PiModel;
  existingSummary: string;
  messages: ShortMemoryMessage[];
}): Promise<string> => {
  if (input.messages.length === 0) {
    return input.existingSummary;
  }

  const { session } = await createAgentSession({
    cwd: input.rootPath,
    agentDir: getPiAgentDir(),
    tools: [],
    model: input.model,
    customTools: [],
    sessionManager: SessionManager.inMemory(),
  });

  let output = '';
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      output += event.assistantMessageEvent.delta;
    }
  });

  const prompt = [
    'Compact Telegram chat context for a coding agent.',
    '',
    'Keep important facts, goals, decisions, files changed, errors, and current status.',
    'Remove small talk and duplicate details.',
    'Return only the updated summary in short plain text bullets.',
    '',
    'Existing summary:',
    input.existingSummary || '(empty)',
    '',
    'Messages to compact:',
    input.messages.map((message) => `${message.role}: ${message.text}`).join('\n'),
  ].join('\n');

  await session.prompt(prompt);
  await session.agent.waitForIdle();

  unsubscribe();
  session.dispose();

  return output.trim() || input.existingSummary;
};
