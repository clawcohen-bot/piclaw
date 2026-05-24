export type ConnectorId = 'telegram' | 'slack';

export type ConnectorMessage = {
  connector: ConnectorId;
  userId: string;
  conversationId: string;
  messageId: string;
  text: string;
};

export type Connector = {
  start(): Promise<void>;
  stop(reason?: string): void;
};
