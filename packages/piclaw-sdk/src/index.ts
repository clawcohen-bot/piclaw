export type PiclawLogger = Pick<Console, 'error' | 'warn' | 'info'>;

export type PiclawStorageAPI = {
  appDataPath(path?: string): string;
  piclawDataPath(path?: string): string;
  obsidianVaultPath(path?: string): string;
  ensureParentDir(path: string): Promise<void>;
};

export type PiclawConnectorMessage = {
  connector: string;
  userId: string;
  conversationId: string;
  threadId?: string;
  messageId: string;
  text: string;
  attachments?: unknown[];
  timestamp: string;
  raw?: unknown;
};

export type PiclawSendMessage = {
  connector: string;
  conversationId: string;
  threadId?: string;
  text: string;
  raw?: unknown;
};

export type PiclawEvents = {
  app_start: { startedAt: string };
  app_shutdown: { reason?: string };
  connector_start: { connector: string };
  connector_message: PiclawConnectorMessage;
  connector_send: PiclawSendMessage;
  before_agent_start: { connector?: string; conversationId: string; prompt: string };
  context_build: { connector?: string; conversationId: string; prompt: string; context: string[] };
  agent_response: { connector?: string; conversationId: string; response: string };
  tool_call: { name: string; input: unknown };
  tool_result: { name: string; input: unknown; result: unknown };
  cron_tick: { name: string; scheduledAt: string };
  model_select: { conversationId: string; provider?: string; model?: string };
  provider_login: { provider: string };
  provider_logout: { provider: string };
};

export type PiclawEventName = keyof PiclawEvents;

export type PiclawEventResult<TEvent> =
  | void
  | {
      blocked?: boolean;
      reason?: string;
      patch?: Partial<TEvent>;
      value?: TEvent;
    };

export type PiclawEventContext = {
  eventName: PiclawEventName;
  logger: PiclawLogger;
};

export type PiclawEventHandler<TEvent> = (
  event: Readonly<TEvent>,
  context: PiclawEventContext,
) => Promise<PiclawEventResult<TEvent>> | PiclawEventResult<TEvent>;

export type CommandHandlerInput = {
  name: string;
  args: string;
  rawText: string;
  conversationId?: string;
  userId?: string;
  context?: unknown;
};

export type PiclawCommand = {
  name: string;
  description: string;
  handler: (input: CommandHandlerInput) => Promise<string | void> | string | void;
};

export type CallbackHandlerInput = {
  name: string;
  data: string;
  connector?: string;
  conversationId?: string;
  userId?: string;
  context?: unknown;
};

export type PiclawCallbackAction = {
  name: string;
  description: string;
  pattern: RegExp;
  handler: (input: CallbackHandlerInput) => Promise<string | void> | string | void;
};

export type PiclawTool = {
  name: string;
  description: string;
  inputSchema?: unknown;
  handler: (input: unknown) => Promise<unknown> | unknown;
};

export type PiclawCronjob = {
  name: string;
  schedule: string;
  handler: (context: { scheduledAt: string }) => Promise<void> | void;
};

export type PiclawProvider = {
  name: string;
  displayName?: string;
  models?: string[] | (() => Promise<string[]> | string[]);
  login?: () => Promise<void> | void;
  logout?: () => Promise<void> | void;
};

export type PiclawExtensionAPI<TConfig = any> = {
  config: TConfig;
  logger: PiclawLogger;
  storage: PiclawStorageAPI;
  on<TName extends PiclawEventName>(name: TName, handler: PiclawEventHandler<PiclawEvents[TName]>): () => void;
  registerTool(tool: PiclawTool): () => void;
  registerCommand(command: PiclawCommand): () => void;
  listCommands(): Array<Pick<PiclawCommand, 'name' | 'description'>>;
  registerCallbackAction(action: PiclawCallbackAction): () => void;
  registerCronjob(cronjob: PiclawCronjob): () => void;
  registerProvider(name: string, provider: PiclawProvider): () => void;
  unregisterProvider(name: string): boolean;
};

export type PiclawExtension<TConfig = any> = (piclaw: PiclawExtensionAPI<TConfig>) => Promise<void> | void;
