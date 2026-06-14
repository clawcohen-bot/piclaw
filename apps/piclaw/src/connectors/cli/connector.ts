import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { createAgentRunner, type AgentRunnerCallbacks } from '../../agent/agent-runner';
import type { AppConfig } from '../../core/config';
import { truncateText } from '../../messages/text';
import type { Connector, ConnectorContext } from '../types';

const conversationKey = 'dev-cli-local';
const replyLimit = 3500;

let activeInterface: Interface | undefined;

const writeLine = (text: string): void => {
  output.write(`${text}\n`);
};

const printPrompt = (): void => {
  output.write('piclaw> ');
};

const createCliRunnerCallbacks = (runner: ReturnType<typeof createAgentRunner>): AgentRunnerCallbacks => {
  const reply = async (text: string): Promise<void> => {
    writeLine(truncateText(text, replyLimit));
  };

  return {
    sendReply: reply,
    sendFormattedReply: reply,
    startTyping: () => {
      writeLine('Thinking...');
      return () => undefined;
    },
    onToolStart: async (_toolCallId, toolName) => {
      writeLine(`Using ${toolName} tool...`);
    },
    onToolEnd: async () => undefined,
    onBusy: async (actionId) => {
      writeLine('Bot is busy. Queued your task.');
      runner.queuePendingTask(actionId);
    },
    onQueuedStart: async () => {
      writeLine('Starting queued task...');
    },
  };
};

const printStatus = (config: AppConfig, runner: ReturnType<typeof createAgentRunner>): void => {
  writeLine(
    [
      'Status: ok',
      `Root: ${config.rootPath}`,
      `Busy: ${runner.taskState.activeTask === undefined ? 'no' : 'yes'}`,
      `Queued: ${runner.taskState.queuedTasks.length}`,
    ].join('\n'),
  );
};

export const createCliConnector = (config: AppConfig): Connector => ({
  name: 'dev-cli',
  start: (context?: ConnectorContext) => startCliConnector(config, context),
  stop: () => {
    activeInterface?.close();
  },
});

export const startCliConnector = async (config: AppConfig, context?: ConnectorContext): Promise<void> => {
  const runner = createAgentRunner(config, context?.runtime);
  const callbacks = createCliRunnerCallbacks(runner);
  const readline = createInterface({ input, output, terminal: false });
  activeInterface = readline;
  let messageId = 0;

  writeLine(`Piclaw CLI dev mode. Root: ${config.rootPath}`);
  writeLine('Type a message, /status, or /exit.');
  printPrompt();

  for await (const line of readline) {
    const text = line.trim();

    if (text === '/exit') {
      readline.close();
      break;
    }

    if (text === '/status') {
      printStatus(config, runner);
      printPrompt();
      continue;
    }

    if (text === '') {
      printPrompt();
      continue;
    }

    messageId += 1;
    const message = {
      connector: 'dev-cli',
      userId: 'local',
      conversationId: conversationKey,
      messageId: String(messageId),
      text,
      timestamp: new Date().toISOString(),
      raw: line,
    };
    const eventResult = await context?.runtime.events.dispatch('connector_message', message);
    if (eventResult?.blocked === true) {
      writeLine(eventResult.reason ?? 'Message blocked.');
      printPrompt();
      continue;
    }

    await runner.submitTask({
      conversationKey,
      messageId,
      text: eventResult?.event.text ?? text,
      callbacks,
    });
    printPrompt();
  }
};
