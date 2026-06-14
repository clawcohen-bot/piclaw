import type { AppConfig } from './config';
import { createEventBus, type PiclawEventBus } from './events';
import {
  createCommandRegistry,
  createCronjobRegistry,
  createProviderRegistry,
  createToolRegistry,
  type CommandRegistry,
  type CronjobRegistry,
  type ProviderRegistry,
  type ToolRegistry,
} from './registries';
import type { PiclawExtensionAPI } from './extension-api';

export type PiclawRuntime = {
  config: AppConfig;
  events: PiclawEventBus;
  commands: CommandRegistry;
  tools: ToolRegistry;
  cronjobs: CronjobRegistry;
  providers: ProviderRegistry;
  api: PiclawExtensionAPI;
  logger: Pick<Console, 'error' | 'warn' | 'info'>;
};

export const createPiclawRuntime = (
  config: AppConfig,
  logger: Pick<Console, 'error' | 'warn' | 'info'> = console,
): PiclawRuntime => {
  const events = createEventBus({ logger });
  const commands = createCommandRegistry();
  const tools = createToolRegistry(events);
  const cronjobs = createCronjobRegistry(events);
  const providers = createProviderRegistry();

  const runtime = {
    config,
    events,
    commands,
    tools,
    cronjobs,
    providers,
    logger,
  } as PiclawRuntime;

  runtime.api = {
    config,
    logger,
    on: events.on,
    registerCommand: commands.register,
    registerTool: tools.register,
    registerCronjob: cronjobs.register,
    registerProvider: providers.register,
    unregisterProvider: providers.unregister,
  };

  return runtime;
};
