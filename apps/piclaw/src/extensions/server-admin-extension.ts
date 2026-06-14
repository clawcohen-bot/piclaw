import { getErrorMessage } from '../core/error';
import type { PiclawExtensionAPI } from '../core/extension-api';
import { codeBlock } from '../messages/format';
import { formatServices, getServerStatus, readAllowedLogs, restartAllowedService } from '../server/server';

type ReplyContext = {
  reply?: (text: string, extra?: unknown) => Promise<unknown> | unknown;
};

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

export const registerServerAdminExtension = (piclaw: PiclawExtensionAPI): void => {
  piclaw.registerCommand({
    name: 'server-status',
    description: 'Show server status.',
    handler: async (input) => {
      try {
        const status = await getServerStatus();
        if (await replyHtml(input.context, codeBlock(status))) {
          return;
        }
        return status;
      } catch (error) {
        return `Server status failed: ${getErrorMessage(error)}`;
      }
    },
  });

  piclaw.registerCommand({
    name: 'server-services',
    description: 'List configured restartable services.',
    handler: () => formatServices(piclaw.config),
  });

  piclaw.registerCommand({
    name: 'server-logs',
    description: 'Read allowed service or log-file output.',
    handler: async (input) => {
      const name = input.args.trim();
      if (name === '') {
        return 'Use /server-logs <name>';
      }

      try {
        const logs = await readAllowedLogs(piclaw.config, name);
        if (await replyHtml(input.context, codeBlock(logs))) {
          return;
        }
        return logs;
      } catch (error) {
        return `Server logs failed: ${getErrorMessage(error)}`;
      }
    },
  });

  piclaw.registerCommand({
    name: 'server-restart',
    description: 'Restart an allowed service.',
    handler: async (input) => {
      const service = input.args.trim();
      if (service === '') {
        return 'Use /server-restart <service>';
      }

      try {
        await reply(input.context, `Restarting ${service}...`);
        return restartAllowedService(piclaw.config, service);
      } catch (error) {
        return `Server restart failed: ${getErrorMessage(error)}`;
      }
    },
  });
};

export default registerServerAdminExtension;
