import { loadConfig } from './config';
import { createTelegramConnector } from './connectors/telegram/connector';
import { ensureAppDirs } from './storage';

const main = async (): Promise<void> => {
  await ensureAppDirs();
  const config = await loadConfig();
  const connector = createTelegramConnector(config);
  await connector.start();
};

void main();
