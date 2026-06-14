import type { createAgentRunner } from '../agent/agent-runner';
import { formatContextUsage } from '../agent/usage';
import type { PiclawExtensionAPI } from '../core/extension-api';

type AgentRunner = ReturnType<typeof createAgentRunner>;

type CallbackContext = {
  answerCbQuery?: (text: string) => Promise<unknown> | unknown;
  reply?: (text: string, extra?: unknown) => Promise<unknown> | unknown;
};

const asCallbackContext = (context: unknown): CallbackContext =>
  typeof context === 'object' && context !== null ? context as CallbackContext : {};

const answerCallback = async (context: unknown, text: string): Promise<void> => {
  const callbackContext = asCallbackContext(context);
  if (typeof callbackContext.answerCbQuery === 'function') {
    await callbackContext.answerCbQuery(text);
  }
};

const reply = async (context: unknown, text: string): Promise<void> => {
  const callbackContext = asCallbackContext(context);
  if (typeof callbackContext.reply === 'function') {
    await callbackContext.reply(text);
  }
};

export const registerAgentControlExtension = (piclaw: PiclawExtensionAPI, agentRunner: AgentRunner): void => {
  piclaw.registerCommand({
    name: 'usage',
    description: 'Show current context usage.',
    handler: async (input) => {
      if (input.conversationId === undefined) {
        return 'Cannot show usage without chat.';
      }

      const conversationKey = Number(input.conversationId);
      if (!Number.isFinite(conversationKey)) {
        return 'Cannot show usage without numeric chat.';
      }

      const { usage, model } = await agentRunner.getCurrentContextUsage(conversationKey);
      return formatContextUsage(usage, model);
    },
  });

  piclaw.registerCommand({
    name: 'cancel',
    description: 'Cancel the active agent task.',
    handler: async () => {
      if (!(await agentRunner.cancelActiveTask())) {
        return 'No active task.';
      }
      return 'Cancelled active task.';
    },
  });

  piclaw.registerCallbackAction({
    name: 'busy',
    description: 'Handle busy-task inline button choices.',
    pattern: /^busy:(queue|cancel|ignore):.+$/,
    handler: async (input) => {
      const parts = input.data.split(':');
      const action = parts[1];
      const actionId = parts[2];
      if (actionId === undefined) {
        await answerCallback(input.context, 'Invalid busy action');
        return;
      }

      if (action === 'queue') {
        if (!agentRunner.queuePendingTask(actionId)) {
          await answerCallback(input.context, 'Task expired');
          return;
        }
        await answerCallback(input.context, 'Queued');
        await reply(input.context, 'Queued task.');
        return;
      }

      if (action === 'cancel') {
        if (!(await agentRunner.cancelAndQueuePendingTask(actionId))) {
          await answerCallback(input.context, 'Task expired');
          return;
        }
        await answerCallback(input.context, 'Cancelled current and queued new task');
        await reply(input.context, 'Cancelled current task and queued new task.');
        return;
      }

      if (!agentRunner.ignorePendingTask(actionId)) {
        await answerCallback(input.context, 'Task expired');
        return;
      }
      await answerCallback(input.context, 'Ignored');
      await reply(input.context, 'Ignored new task.');
    },
  });
};

export default registerAgentControlExtension;
