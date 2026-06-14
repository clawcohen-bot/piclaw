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

export type PiclawEventHandler<TEvent> = (
  event: Readonly<TEvent>,
  context: PiclawEventContext,
) => Promise<PiclawEventResult<TEvent>> | PiclawEventResult<TEvent>;

export type PiclawEventContext = {
  eventName: PiclawEventName;
  logger: Pick<Console, 'error' | 'warn' | 'info'>;
};

export type DispatchResult<TEvent> = {
  event: TEvent;
  blocked: boolean;
  reason?: string;
};

export type EventBusOptions = {
  crashOnHandlerError?: boolean;
  logger?: Pick<Console, 'error' | 'warn' | 'info'>;
};

export type PiclawEventBus = {
  on<TName extends PiclawEventName>(name: TName, handler: PiclawEventHandler<PiclawEvents[TName]>): () => void;
  emit<TName extends PiclawEventName>(name: TName, event: PiclawEvents[TName]): Promise<void>;
  dispatch<TName extends PiclawEventName>(name: TName, event: PiclawEvents[TName]): Promise<DispatchResult<PiclawEvents[TName]>>;
  listenerCount(name: PiclawEventName): number;
};

export const createEventBus = (options: EventBusOptions = {}): PiclawEventBus => {
  const handlers = new Map<PiclawEventName, PiclawEventHandler<PiclawEvents[PiclawEventName]>[]>();
  const logger = options.logger ?? console;

  const getHandlers = (name: PiclawEventName): PiclawEventHandler<PiclawEvents[PiclawEventName]>[] => handlers.get(name) ?? [];

  const runHandler = async <TName extends PiclawEventName>(
    name: TName,
    handler: PiclawEventHandler<PiclawEvents[TName]>,
    event: PiclawEvents[TName],
  ): Promise<PiclawEventResult<PiclawEvents[TName]>> => {
    try {
      return await handler(Object.freeze({ ...event }), { eventName: name, logger });
    } catch (error) {
      if (options.crashOnHandlerError === true) {
        throw error;
      }
      logger.error(`Piclaw event handler failed for ${name}`, error);
      return undefined;
    }
  };

  return {
    on: (name, handler) => {
      const current = getHandlers(name);
      handlers.set(name, [...current, handler as PiclawEventHandler<PiclawEvents[PiclawEventName]>]);
      return () => {
        handlers.set(
          name,
          getHandlers(name).filter((item) => item !== handler),
        );
      };
    },
    emit: async (name, event) => {
      for (const handler of getHandlers(name)) {
        await runHandler(name, handler as PiclawEventHandler<typeof event>, event);
      }
    },
    dispatch: async (name, event) => {
      let current = { ...event } as PiclawEvents[typeof name];
      for (const handler of getHandlers(name)) {
        const result = await runHandler(name, handler as PiclawEventHandler<typeof current>, current);
        if (result?.value !== undefined) {
          current = result.value;
        }
        if (result?.patch !== undefined) {
          current = { ...current, ...result.patch };
        }
        if (result?.blocked === true) {
          return { event: current, blocked: true, reason: result.reason };
        }
      }
      return { event: current, blocked: false };
    },
    listenerCount: (name) => getHandlers(name).length,
  };
};
