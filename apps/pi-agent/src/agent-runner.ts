import { reviewTelegramMemory, shouldReviewMemory } from './auto-memory';
import type { AppConfig } from './config';
import { getErrorMessage } from './error';
import {
  addShortMemoryMessage,
  readMarkdownMemory,
  readSessionSummary,
  readShortMemory,
  writeMarkdownMemory,
  writeSessionSummary,
  writeShortMemory,
} from './memory';
import { readAgentMode } from './mode';
import { readSelectedModel } from './model';
import { compactTelegramContext, runPiTask } from './pi-task';
import { createTaskState, isBusy, popQueuedTask, queueTask, type TaskState } from './task-state';
import { truncateText } from './text';
import {
  buildPiTaskContext,
  calculateContextUsage,
  formatContextWarning,
  getUsageWarningLevel,
  readWarnedUsageLevels,
  writeWarnedUsageLevels,
} from './usage';

const rootMemoryId = 'server-root';
const rawContextMessageCount = 15;
const compactContextThreshold = 20;

export type AgentRunnerCallbacks = {
  sendReply(text: string): Promise<void>;
  sendFormattedReply(text: string): Promise<void>;
  startTyping(): () => void;
  onToolStart(toolCallId: string, toolName: string): Promise<void>;
  onToolEnd(toolCallId: string): Promise<void>;
  onBusy(actionId: string): Promise<void>;
  onQueuedStart(): Promise<void>;
};

export type AgentRunnerSubmitInput = {
  chatId: number;
  messageId: number;
  text: string;
  callbacks: AgentRunnerCallbacks;
};

export type AgentRunner = {
  taskState: TaskState;
  pendingBusyTasks: Map<string, string>;
  submitTask(input: AgentRunnerSubmitInput): Promise<void>;
  queuePendingTask(actionId: string): boolean;
  cancelAndQueuePendingTask(actionId: string): Promise<boolean>;
  ignorePendingTask(actionId: string): boolean;
  cancelActiveTask(): Promise<boolean>;
  getCurrentContextUsage(chatId: number, prompt?: string): Promise<{
    usage: ReturnType<typeof calculateContextUsage>;
    model: Awaited<ReturnType<typeof readSelectedModel>>;
  }>;
};

export const createAgentRunner = (config: AppConfig): AgentRunner => {
  const taskState = createTaskState();
  const pendingBusyTasks = new Map<string, string>();

  const getCurrentContextUsage = async (chatId: number, prompt = '') => {
    const [shortMemory, markdownMemory, sessionSummary, mode, model] = await Promise.all([
      readShortMemory(chatId, rootMemoryId),
      readMarkdownMemory(),
      readSessionSummary(),
      readAgentMode(chatId),
      readSelectedModel(chatId),
    ]);

    const context = buildPiTaskContext({
      rootPath: config.rootPath,
      prompt,
      model,
      shortMemory,
      memory: markdownMemory,
      sessionSummary,
      mode,
    });

    return { usage: calculateContextUsage(context, model), model };
  };

  const sendContextWarningIfNeeded = async (chatId: number, callbacks: AgentRunnerCallbacks): Promise<void> => {
    const { usage } = await getCurrentContextUsage(chatId);
    const level = getUsageWarningLevel(usage);
    if (level === undefined) {
      return;
    }

    const warned = await readWarnedUsageLevels(chatId);
    if (warned.includes(level)) {
      return;
    }

    await writeWarnedUsageLevels(chatId, [...warned, level]);
    await callbacks.sendReply(formatContextWarning(usage, level));
  };

  const compactContextIfNeeded = async (chatId: number): Promise<void> => {
    const shortMemory = await readShortMemory(chatId, rootMemoryId);
    if (shortMemory.length <= compactContextThreshold) {
      return;
    }

    const messagesToCompact = shortMemory.slice(0, -rawContextMessageCount);
    const messagesToKeep = shortMemory.slice(-rawContextMessageCount);
    if (messagesToCompact.length === 0) {
      return;
    }

    try {
      const model = await readSelectedModel(chatId);
      const summary = await compactTelegramContext({
        rootPath: config.rootPath,
        model,
        existingSummary: await readSessionSummary(),
        messages: messagesToCompact,
      });
      await writeSessionSummary(summary);
      await writeShortMemory(chatId, rootMemoryId, messagesToKeep);
    } catch {
      // Keep raw short memory if compacting fails.
    }
  };

  const runTask = async (chatId: number, taskText: string, sourceMessageId: number, callbacks: AgentRunnerCallbacks): Promise<void> => {
    taskState.activeTask = {
      abort: async () => Promise.resolve(),
    };

    const stopTypingIndicator = callbacks.startTyping();
    const activeToolIds = new Set<string>();

    const finishTool = async (toolCallId: string): Promise<void> => {
      if (!activeToolIds.has(toolCallId)) {
        return;
      }
      activeToolIds.delete(toolCallId);
      await callbacks.onToolEnd(toolCallId);
    };

    try {
      const shortMemory = await readShortMemory(chatId, rootMemoryId);
      const markdownMemory = await readMarkdownMemory();
      const sessionSummary = await readSessionSummary();
      const mode = await readAgentMode(chatId);
      const model = await readSelectedModel(chatId);
      const result = await runPiTask({
        rootPath: config.rootPath,
        prompt: taskText,
        model,
        shortMemory,
        memory: markdownMemory,
        sessionSummary,
        mode,
        onToolStart: async (toolCallId, toolName) => {
          activeToolIds.add(toolCallId);
          await callbacks.onToolStart(toolCallId, toolName);
        },
        onToolEnd: finishTool,
      });

      await callbacks.sendFormattedReply(truncateText(result, 3500));
      await addShortMemoryMessage(chatId, {
        role: 'bot',
        text: result,
        timestamp: new Date().toISOString(),
        rootId: rootMemoryId,
        messageId: sourceMessageId,
      });
      await sendContextWarningIfNeeded(chatId, callbacks);
    } catch (error) {
      await callbacks.sendReply(`Task failed: ${getErrorMessage(error)}`);
    } finally {
      await Promise.all([...activeToolIds].map(finishTool));
      stopTypingIndicator();
      taskState.activeTask = undefined;
      const queued = popQueuedTask(taskState);
      if (queued !== undefined) {
        await callbacks.onQueuedStart();
        await runTask(chatId, queued, sourceMessageId, callbacks);
      }
    }
  };

  const reviewMemoryIfNeeded = async (chatId: number, text: string, callbacks: AgentRunnerCallbacks): Promise<void> => {
    if (!shouldReviewMemory(text)) {
      return;
    }

    try {
      const [currentMemory, recentMessages, model] = await Promise.all([
        readMarkdownMemory(),
        readShortMemory(chatId, rootMemoryId),
        readSelectedModel(chatId),
      ]);
      const update = await reviewTelegramMemory({
        rootPath: config.rootPath,
        model,
        currentMemory,
        recentMessages,
        userText: text,
      });

      if (update === undefined || update.memory === currentMemory.trim()) {
        return;
      }

      await writeMarkdownMemory(update.memory);
      if (update.notification !== '') {
        await callbacks.sendReply(truncateText(update.notification, 300));
      }
    } catch {
      // Memory review should never block the user's task.
    }
  };

  const submitTask = async ({ chatId, messageId, text, callbacks }: AgentRunnerSubmitInput): Promise<void> => {
    await addShortMemoryMessage(chatId, {
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
      rootId: rootMemoryId,
      messageId,
    });
    void reviewMemoryIfNeeded(chatId, text, callbacks);
    await compactContextIfNeeded(chatId);

    if (isBusy(taskState)) {
      const actionId = `${Date.now()}-task`;
      pendingBusyTasks.set(actionId, text);
      await callbacks.onBusy(actionId);
      return;
    }

    void runTask(chatId, text, messageId, callbacks);
  };

  return {
    taskState,
    pendingBusyTasks,
    submitTask,
    queuePendingTask: (actionId) => {
      const pending = pendingBusyTasks.get(actionId);
      if (pending === undefined) {
        return false;
      }
      pendingBusyTasks.delete(actionId);
      queueTask(taskState, pending);
      return true;
    },
    cancelAndQueuePendingTask: async (actionId) => {
      const pending = pendingBusyTasks.get(actionId);
      if (pending === undefined) {
        return false;
      }
      pendingBusyTasks.delete(actionId);
      await taskState.activeTask?.abort();
      taskState.activeTask = undefined;
      queueTask(taskState, pending);
      return true;
    },
    ignorePendingTask: (actionId) => pendingBusyTasks.delete(actionId),
    cancelActiveTask: async () => {
      if (taskState.activeTask === undefined) {
        return false;
      }
      await taskState.activeTask.abort();
      taskState.activeTask = undefined;
      return true;
    },
    getCurrentContextUsage,
  };
};
