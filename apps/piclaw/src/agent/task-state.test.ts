import { describe, expect, it, vi } from 'vitest';

import { createTaskState, isBusy, popQueuedTask, queueTask } from './task-state';

describe('task state', () => {
  it('creates idle state and reports busy only with active task', () => {
    const state = createTaskState();
    expect(state).toEqual({ activeTask: undefined, queuedTasks: [] });
    expect(isBusy(state)).toBe(false);
    state.activeTask = { abort: vi.fn() };
    expect(isBusy(state)).toBe(true);
  });

  it('queues and pops tasks FIFO', () => {
    const state = createTaskState();
    queueTask(state, 'first');
    queueTask(state, 'second');
    expect(popQueuedTask(state)).toBe('first');
    expect(popQueuedTask(state)).toBe('second');
    expect(popQueuedTask(state)).toBeUndefined();
  });
});
