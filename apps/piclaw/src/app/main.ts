import { loadConfig } from '../core/config';
import { createCliConnector } from '../connectors/cli/connector';
import { createSlackConnector } from '../connectors/slack/connector';
import { createTelegramConnector } from '../connectors/telegram/connector';
import { ensureAppDirs } from '../core/storage';
import { createPiclawRuntime } from '../core/runtime';
import { getDefaultExtensionPaths, loadExtensions } from '../core/extensions';
import { discoverPiclawPackages } from '../features/packages/package-discovery';
import { registerAuthExtension } from '../extensions/auth-extension';
import { registerModelExtension } from '../extensions/model-extension';

const main = async (): Promise<void> => {
  await ensureAppDirs();
  const config = await loadConfig();
  const runtime = createPiclawRuntime(config);
  registerAuthExtension(runtime.api);
  registerModelExtension(runtime.api);
  const packageResources = await discoverPiclawPackages(config.packages);
  await loadExtensions([
    ...getDefaultExtensionPaths(config.rootPath),
    ...config.extensions,
    ...packageResources.extensionPaths,
  ], runtime.api);

  const connectors = [
    ...(config.telegram.enabled ? [createTelegramConnector(config)] : []),
    ...(config.slack.enabled ? [createSlackConnector(config)] : []),
    ...(config.devCli.enabled ? [createCliConnector(config)] : []),
  ];

  if (connectors.length === 0) {
    throw new Error('No connectors enabled');
  }

  await runtime.events.emit('app_start', { startedAt: new Date().toISOString() });
  await Promise.all(connectors.map(async (connector) => {
    await runtime.events.emit('connector_start', { connector: connector.name });
    await connector.start({ runtime });
  }));
};

void main();
