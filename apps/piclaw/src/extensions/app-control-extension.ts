import type { createAgentRunner } from '../agent/agent-runner';
import { formatAgentMode, isAgentMode, readAgentMode, writeAgentMode } from '../agent/mode';
import { getSelectedModelText } from '../agent/model';
import { isBusy } from '../agent/task-state';
import { getConfigPath } from '../core/config';
import type { PiclawExtensionAPI } from '../core/extension-api';
import { formatPackagesList } from '../features/packages/packages';
import { formatSkillsStatusList, formatSkillsTelegramHtml } from '../features/skills/skills';
import { buildHelpText } from '../messages/commands';
import { truncateText } from '../messages/text';

type AgentRunner = ReturnType<typeof createAgentRunner>;

type AppControlOptions = {
  agentRunner: AgentRunner;
  reload?: () => void;
};

type ReplyContext = {
  reply?: (text: string, extra?: unknown) => Promise<unknown> | unknown;
};

const reloadExitDelayMs = 500;

const asReplyContext = (context: unknown): ReplyContext =>
  typeof context === 'object' && context !== null ? context as ReplyContext : {};

const reply = async (context: unknown, text: string, extra?: unknown): Promise<boolean> => {
  const replyContext = asReplyContext(context);
  if (typeof replyContext.reply !== 'function') {
    return false;
  }

  if (extra === undefined) {
    await replyContext.reply(text);
    return true;
  }

  await replyContext.reply(text, extra);
  return true;
};

const replyHtml = async (context: unknown, html: string): Promise<boolean> =>
  reply(context, html, { parse_mode: 'HTML' });

export const registerAppControlExtension = (piclaw: PiclawExtensionAPI, options: AppControlOptions): void => {
  piclaw.registerCommand({
    name: 'start',
    description: 'Show Piclaw help and runtime paths.',
    handler: () => `${buildHelpText(piclaw.listCommands())}\n\nRoot: ${piclaw.config.rootPath}\nConfig: ${getConfigPath()}`,
  });

  piclaw.registerCommand({
    name: 'status',
    description: 'Show Piclaw runtime status.',
    handler: async (input) => {
      const conversationKey = input.conversationId === undefined ? undefined : Number(input.conversationId);
      const hasConversationKey = conversationKey !== undefined && Number.isFinite(conversationKey);
      const mode = hasConversationKey ? await readAgentMode(conversationKey) : undefined;
      const model = hasConversationKey ? await getSelectedModelText(conversationKey) : 'unknown';
      const skills = formatSkillsStatusList(piclaw.config.rootPath);
      const packages = await formatPackagesList();

      return truncateText(
        [
          'Status: ok',
          '',
          `Root: ${piclaw.config.rootPath}`,
          `Mode: ${mode === undefined ? 'unknown' : formatAgentMode(mode)}`,
          `Model: ${model}`,
          `Busy: ${isBusy(options.agentRunner.taskState) ? 'yes' : 'no'}`,
          `Queued: ${options.agentRunner.taskState.queuedTasks.length}`,
          '',
          skills,
          '',
          packages,
        ].join('\n'),
        3500,
      );
    },
  });

  piclaw.registerCommand({
    name: 'skills',
    description: 'Show available Piclaw skills.',
    handler: async (input) => {
      const html = formatSkillsTelegramHtml(piclaw.config.rootPath);
      if (await replyHtml(input.context, html)) {
        return;
      }
      return html;
    },
  });

  piclaw.registerCommand({
    name: 'mode',
    description: 'Show or change agent mode.',
    handler: async (input) => {
      if (input.conversationId === undefined) {
        return 'Cannot use /mode without chat.';
      }

      const conversationKey = Number(input.conversationId);
      if (!Number.isFinite(conversationKey)) {
        return 'Cannot use /mode without numeric chat.';
      }

      const payload = input.args.trim().toLowerCase();
      if (payload === '') {
        const mode = await readAgentMode(conversationKey);
        return `Current mode: ${formatAgentMode(mode)}\n\nUse /mode agent or /mode ask`;
      }

      if (!isAgentMode(payload)) {
        return 'Unknown mode. Use /mode agent or /mode ask';
      }

      await writeAgentMode(conversationKey, payload);
      return `Mode changed to ${formatAgentMode(payload)}.`;
    },
  });

  piclaw.registerCommand({
    name: 'reload',
    description: 'Reload the Piclaw process.',
    handler: async (input) => {
      if (options.reload === undefined) {
        return 'Reload is not available.';
      }

      await reply(input.context, 'Reloading bot...');
      setTimeout(options.reload, reloadExitDelayMs);
    },
  });
};

export default registerAppControlExtension;
