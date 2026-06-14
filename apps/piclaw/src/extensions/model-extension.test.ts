import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseConfig } from '../core/config';
import { createPiclawRuntime } from '../core/runtime';
import { registerModelExtension } from './model-extension';

const modelA = { provider: 'openai', id: 'gpt', name: 'GPT' };
const modelB = { provider: 'anthropic', id: 'claude', name: 'Claude' };

const modelMock = vi.hoisted(() => ({
  formatModel: vi.fn((model: { provider: string; id: string }) => `${model.provider}/${model.id}`),
  formatModelLabel: vi.fn((model: { provider: string; id: string; name: string }) => `${model.name} (${model.provider}/${model.id})`),
  getAvailableModels: vi.fn(),
  getSelectedModelText: vi.fn(),
  writeSelectedModel: vi.fn(),
}));

vi.mock('../agent/model', () => modelMock);

const createRuntime = () => createPiclawRuntime(parseConfig({
  telegram: { allowedUserIds: [] },
  devCli: { enabled: true },
  rootPath: '.',
  server: { services: [], logFiles: [] },
  extensions: [],
  packages: [],
  models: { providers: {} },
}));

describe('model extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelMock.getAvailableModels.mockReturnValue([modelA, modelB]);
    modelMock.getSelectedModelText.mockResolvedValue('Pi default');
    modelMock.writeSelectedModel.mockResolvedValue(undefined);
  });

  it('registers model command and callback', () => {
    const runtime = createRuntime();
    registerModelExtension(runtime.api);

    expect(runtime.commands.get('model')).toBeDefined();
    expect(runtime.callbacks.get('model')).toBeDefined();
  });

  it('shows model choices using connector buttons when available', async () => {
    const runtime = createRuntime();
    registerModelExtension(runtime.api);
    const reply = vi.fn(async () => undefined);

    await runtime.commands.get('model')?.handler({
      name: 'model',
      args: '',
      rawText: '/model',
      conversationId: '123',
      context: { reply },
    });

    expect(reply).toHaveBeenCalledWith('Current model: Pi default\n\nChoose a model:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'GPT (openai/gpt)', callback_data: 'model:0' }],
          [{ text: 'Claude (anthropic/claude)', callback_data: 'model:1' }],
        ],
      },
    });
  });

  it('selects a model from a callback without Telegram-specific registration', async () => {
    const runtime = createRuntime();
    registerModelExtension(runtime.api);
    const answerCbQuery = vi.fn(async () => undefined);

    await expect(runtime.callbacks.handle({
      data: 'model:1',
      connector: 'telegram',
      conversationId: '123',
      context: { answerCbQuery },
    })).resolves.toEqual({ handled: true, result: 'Model changed to anthropic/claude.' });

    expect(modelMock.writeSelectedModel).toHaveBeenCalledWith('123', modelB);
    expect(answerCbQuery).toHaveBeenCalledWith('Model changed');
  });

  it('returns plain text choices without connector button support', async () => {
    const runtime = createRuntime();
    registerModelExtension(runtime.api);

    await expect(runtime.commands.get('model')?.handler({
      name: 'model',
      args: '',
      rawText: '/model',
      conversationId: '123',
    })).resolves.toContain('1. GPT (openai/gpt)');
  });
});
