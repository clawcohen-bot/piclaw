import type { PiclawRuntime } from '../core/runtime';
import type { PiclawConnectorMessage } from '../core/events';

export type ConnectorId = 'telegram' | 'slack' | 'dev-cli' | string;

export type ConnectorMessage = PiclawConnectorMessage;

export type ConnectorContext = {
  runtime: PiclawRuntime;
};

export type Connector = {
  name: ConnectorId;
  start(context?: ConnectorContext): Promise<void>;
  stop(reason?: string): void;
};
