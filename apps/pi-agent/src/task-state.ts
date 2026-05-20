export type ActiveTask = {
  abort: () => Promise<void>;
};

export type TaskState = {
  activeTask: ActiveTask | undefined;
  queuedTasks: string[];
};

export const createTaskState = (): TaskState => ({
  activeTask: undefined,
  queuedTasks: [],
});

export const isBusy = (state: TaskState): boolean => state.activeTask !== undefined;

export const queueTask = (state: TaskState, text: string): void => {
  state.queuedTasks = [...state.queuedTasks, text];
};

export const popQueuedTask = (state: TaskState): string | undefined => {
  const [next, ...rest] = state.queuedTasks;
  state.queuedTasks = rest;
  return next;
};
