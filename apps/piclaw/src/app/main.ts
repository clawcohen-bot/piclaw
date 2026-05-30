import { loadConfig } from '../core/config';
import { createCliConnector } from '../connectors/cli/connector';
import { createSlackConnector } from '../connectors/slack/connector';
import { createTelegramConnector } from '../connectors/telegram/connector';
import { ensureAppDirs } from '../core/storage';

const main = async (): Promise<void> => {
  await ensureAppDirs();
  const config = await loadConfig();
  const connectors = [
    ...(config.telegram.enabled ? [createTelegramConnector(config)] : []),
    ...(config.slack.enabled ? [createSlackConnector(config)] : []),
    ...(config.devCli.enabled ? [createCliConnector(config)] : []),
  ];

  if (connectors.length === 0) {
    throw new Error('No connectors enabled');
  }

  await Promise.all(connectors.map((connector) => connector.start()));
};

void main();
