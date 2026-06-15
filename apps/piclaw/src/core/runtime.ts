import { join } from 'node:path';

import type { AppConfig } from './config';
import { createEventBus, type PiclawEventBus } from './events';
import {
  createCallbackActionRegistry,
  createCommandRegistry,
  createCronjobRegistry,
  createProviderRegistry,
  createToolRegistry,
  type CallbackActionRegistry,
  type CommandRegistry,
  type CronjobRegistry,
  type ProviderRegistry,
  type ToolRegistry,
} from './registries';
import type { PiclawExtensionAPI, PiclawStorageAPI } from '@piclaw/sdk';
import { ensureParentDir, getAppDir, getObsidianVaultDir, getPiSdkDir } from './storage';

export type PiclawRuntime = {
  config: AppConfig;
  events: PiclawEventBus;
  commands: CommandRegistry;
  callbacks: CallbackActionRegistry;
  tools: ToolRegistry;
  cronjobs: CronjobRegistry;
  providers: ProviderRegistry;
  api: PiclawExtensionAPI;
  logger: Pick<Console, 'error' | 'warn' | 'info'>;
};

const createStorageAPI = (): PiclawStorageAPI => ({
  appDataPath: (path = '') => path.length === 0 ? getAppDir() : join(getAppDir(), path),
  piclawDataPath: (path = '') => path.length === 0 ? getPiSdkDir() : join(getPiSdkDir(), path),
  obsidianVaultPath: (path = '') => path.length === 0 ? getObsidianVaultDir() : join(getObsidianVaultDir(), path),
  ensureParentDir,
});

export const createPiclawRuntime = (
  config: AppConfig,
  logger: Pick<Console, 'error' | 'warn' | 'info'> = console,
): PiclawRuntime => {
  const events = createEventBus({ logger });
  const commands = createCommandRegistry();
  const callbacks = createCallbackActionRegistry();
  const tools = createToolRegistry(events);
  const cronjobs = createCronjobRegistry(events);
  const providers = createProviderRegistry();

  const runtime = {
    config,
    events,
    commands,
    callbacks,
    tools,
    cronjobs,
    providers,
    logger,
  } as PiclawRuntime;

  runtime.api = {
    config,
    logger,
    storage: createStorageAPI(),
    on: events.on,
    registerCommand: commands.register,
    listCommands: () => commands.list().map(({ name, description }) => ({ name, description })),
    registerCallbackAction: callbacks.register,
    registerTool: tools.register,
    registerCronjob: cronjobs.register,
    registerProvider: providers.register,
    unregisterProvider: providers.unregister,
  };

  return runtime;
};
