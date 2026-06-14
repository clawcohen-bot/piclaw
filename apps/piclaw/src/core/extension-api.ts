import type { AppConfig } from './config';
import type { PiclawEventHandler, PiclawEventName, PiclawEvents } from './events';
import type { PiclawCommand, PiclawCronjob, PiclawProvider, PiclawTool } from './registries';

export type PiclawExtensionAPI = {
  config: AppConfig;
  logger: Pick<Console, 'error' | 'warn' | 'info'>;
  on<TName extends PiclawEventName>(name: TName, handler: PiclawEventHandler<PiclawEvents[TName]>): () => void;
  registerTool(tool: PiclawTool): () => void;
  registerCommand(command: PiclawCommand): () => void;
  registerCronjob(cronjob: PiclawCronjob): () => void;
  registerProvider(name: string, provider: PiclawProvider): () => void;
  unregisterProvider(name: string): boolean;
};

export type PiclawExtension = (piclaw: PiclawExtensionAPI) => Promise<void> | void;
