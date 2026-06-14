import type { PiclawEventBus } from './events';

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

export type CommandRegistry = {
  register(command: PiclawCommand): () => void;
  get(name: string): PiclawCommand | undefined;
  list(): PiclawCommand[];
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

export type CallbackActionRegistry = {
  register(action: PiclawCallbackAction): () => void;
  get(name: string): PiclawCallbackAction | undefined;
  list(): PiclawCallbackAction[];
  match(data: string): PiclawCallbackAction | undefined;
  handle(input: Omit<CallbackHandlerInput, 'name'>): Promise<{ handled: boolean; result?: string | void }>;
};

export type PiclawTool = {
  name: string;
  description: string;
  inputSchema?: unknown;
  handler: (input: unknown) => Promise<unknown> | unknown;
};

export type ToolRegistry = {
  register(tool: PiclawTool): () => void;
  get(name: string): PiclawTool | undefined;
  list(): PiclawTool[];
  call(name: string, input: unknown): Promise<unknown>;
};

export type PiclawCronjob = {
  name: string;
  schedule: string;
  handler: (context: { scheduledAt: string }) => Promise<void> | void;
};

export type CronjobRegistry = {
  register(cronjob: PiclawCronjob): () => void;
  get(name: string): PiclawCronjob | undefined;
  list(): PiclawCronjob[];
  tick(name: string, scheduledAt?: string): Promise<boolean>;
};

export type PiclawProvider = {
  name: string;
  displayName?: string;
  models?: string[] | (() => Promise<string[]> | string[]);
  login?: () => Promise<void> | void;
  logout?: () => Promise<void> | void;
};

export type ProviderRegistry = {
  register(name: string, provider: PiclawProvider): () => void;
  unregister(name: string): boolean;
  get(name: string): PiclawProvider | undefined;
  list(): PiclawProvider[];
};

const normalizeName = (name: string): string => name.trim().toLowerCase();

export const createCommandRegistry = (): CommandRegistry => {
  const commands = new Map<string, PiclawCommand>();

  return {
    register: (command) => {
      const key = normalizeName(command.name);
      commands.set(key, { ...command, name: key });
      return () => {
        commands.delete(key);
      };
    },
    get: (name) => commands.get(normalizeName(name)),
    list: () => [...commands.values()].sort((left, right) => left.name.localeCompare(right.name)),
  };
};

export const createCallbackActionRegistry = (): CallbackActionRegistry => {
  const actions = new Map<string, PiclawCallbackAction>();

  const matchAction = (data: string): PiclawCallbackAction | undefined => {
    for (const action of actions.values()) {
      action.pattern.lastIndex = 0;
      if (action.pattern.test(data)) {
        return action;
      }
    }
    return undefined;
  };

  return {
    register: (action) => {
      const key = normalizeName(action.name);
      actions.set(key, { ...action, name: key });
      return () => {
        actions.delete(key);
      };
    },
    get: (name) => actions.get(normalizeName(name)),
    list: () => [...actions.values()].sort((left, right) => left.name.localeCompare(right.name)),
    match: matchAction,
    handle: async (input) => {
      const action = matchAction(input.data);
      if (action === undefined) {
        return { handled: false };
      }

      return {
        handled: true,
        result: await action.handler({ ...input, name: action.name }),
      };
    },
  };
};

export const createToolRegistry = (events?: PiclawEventBus): ToolRegistry => {
  const tools = new Map<string, PiclawTool>();

  return {
    register: (tool) => {
      const key = normalizeName(tool.name);
      tools.set(key, { ...tool, name: key });
      return () => {
        tools.delete(key);
      };
    },
    get: (name) => tools.get(normalizeName(name)),
    list: () => [...tools.values()].sort((left, right) => left.name.localeCompare(right.name)),
    call: async (name, input) => {
      const key = normalizeName(name);
      const tool = tools.get(key);
      if (tool === undefined) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const call = await events?.dispatch('tool_call', { name: key, input });
      if (call?.blocked === true) {
        throw new Error(call.reason ?? `Tool blocked: ${key}`);
      }

      const finalInput = call?.event.input ?? input;
      const result = await tool.handler(finalInput);
      await events?.emit('tool_result', { name: key, input: finalInput, result });
      return result;
    },
  };
};

export const createCronjobRegistry = (events?: PiclawEventBus): CronjobRegistry => {
  const cronjobs = new Map<string, PiclawCronjob>();

  return {
    register: (cronjob) => {
      const key = normalizeName(cronjob.name);
      cronjobs.set(key, { ...cronjob, name: key });
      return () => {
        cronjobs.delete(key);
      };
    },
    get: (name) => cronjobs.get(normalizeName(name)),
    list: () => [...cronjobs.values()].sort((left, right) => left.name.localeCompare(right.name)),
    tick: async (name, scheduledAt = new Date().toISOString()) => {
      const key = normalizeName(name);
      const cronjob = cronjobs.get(key);
      if (cronjob === undefined) {
        return false;
      }
      await events?.emit('cron_tick', { name: key, scheduledAt });
      await cronjob.handler({ scheduledAt });
      return true;
    },
  };
};

export const createProviderRegistry = (): ProviderRegistry => {
  const providers = new Map<string, PiclawProvider>();

  return {
    register: (name, provider) => {
      const key = normalizeName(name);
      providers.set(key, { ...provider, name: key });
      return () => {
        providers.delete(key);
      };
    },
    unregister: (name) => providers.delete(normalizeName(name)),
    get: (name) => providers.get(normalizeName(name)),
    list: () => [...providers.values()].sort((left, right) => left.name.localeCompare(right.name)),
  };
};
