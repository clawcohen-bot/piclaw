import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';

import type { ShortMemoryMessage } from './memory';
import { createServerTools } from './server-tools';
import { getPiAgentDir } from './storage';

type RunPiTaskInput = {
  rootPath: string;
  prompt: string;
  shortMemory: ShortMemoryMessage[];
  globalMemory: string;
  rootMemory: string;
  onToolStart: (toolCallId: string, toolName: string) => Promise<void>;
  onToolEnd: (toolCallId: string) => Promise<void>;
};

export const runPiTask = async (input: RunPiTaskInput): Promise<string> => {
  const serverTools = createServerTools({ rootPath: input.rootPath });

  const { session } = await createAgentSession({
    cwd: input.rootPath,
    agentDir: getPiAgentDir(),
    tools: ['read', 'grep', 'find', 'ls', 'server_bash', 'server_write_file', 'server_edit_replace'],
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
    '# Pi Agent Context',
    '',
    `Root path: ${input.rootPath}`,
    '',
    '## Global Memory',
    input.globalMemory || '(empty)',
    '',
    '## Root Memory',
    input.rootMemory || '(empty)',
    '',
    '## Last Telegram Messages',
    input.shortMemory.map((message) => `${message.role}: ${message.text}`).join('\n') || '(empty)',
    '',
    '## User Task',
    input.prompt,
    '',
    'Reply style:',
    '- The final answer is sent to Telegram.',
    '- Use short Telegram-friendly text.',
    '- Prefer bullets and code blocks.',
    '- Avoid large Markdown headings and tables.',
    '',
    'Important tool rules:',
    '- For reading/searching files, use normal read/grep/find/ls tools.',
    '- For shell commands, use server_bash.',
    '- For file writes, use server_write_file.',
    '- For exact text edits, use server_edit_replace.',
    '- Never try to access files outside the configured root path.',
  ].join('\n');

  await session.prompt(context);
  await session.agent.waitForIdle();

  unsubscribe();
  session.dispose();

  return output.trim() || 'Done.';
};
