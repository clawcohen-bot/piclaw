import { AuthStorage, ModelRegistry } from '@earendil-works/pi-coding-agent';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureParentDir, getAppDir, getPiAgentDir } from './storage';

type PiModel = ReturnType<ModelRegistry['getAll']>[number];

type SelectedModel = {
  provider: string;
  id: string;
};

export const getChatModelPath = (chatId: number): string => join(getAppDir(), 'models', `${chatId}.json`);

const createModelRegistry = (): ModelRegistry => {
  const piAgentDir = getPiAgentDir();
  const authStorage = AuthStorage.create(join(piAgentDir, 'auth.json'));
  return ModelRegistry.create(authStorage, join(piAgentDir, 'models.json'));
};

export const getAvailableModels = (): PiModel[] =>
  createModelRegistry()
    .getAvailable()
    .sort((a, b) => `${a.provider}/${a.name}`.localeCompare(`${b.provider}/${b.name}`));

export const formatModel = (model: PiModel): string => `${model.provider}/${model.id}`;

export const formatModelLabel = (model: PiModel): string => `${model.name} (${model.provider}/${model.id})`;

export const readSelectedModelRef = async (chatId: number): Promise<SelectedModel | undefined> => {
  try {
    const raw = await readFile(getChatModelPath(chatId), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'provider' in parsed &&
      'id' in parsed &&
      typeof parsed.provider === 'string' &&
      typeof parsed.id === 'string'
    ) {
      return { provider: parsed.provider, id: parsed.id };
    }
  } catch {
    // Missing or invalid selection means use Pi default.
  }

  return undefined;
};

export const readSelectedModel = async (chatId: number): Promise<PiModel | undefined> => {
  const selected = await readSelectedModelRef(chatId);
  if (selected === undefined) {
    return undefined;
  }

  return getAvailableModels().find((model) => model.provider === selected.provider && model.id === selected.id);
};

export const writeSelectedModel = async (chatId: number, model: PiModel): Promise<void> => {
  const path = getChatModelPath(chatId);
  await ensureParentDir(path);
  await writeFile(path, `${JSON.stringify({ provider: model.provider, id: model.id }, null, 2)}\n`);
};

export const getSelectedModelText = async (chatId: number): Promise<string> => {
  const selected = await readSelectedModel(chatId);
  return selected === undefined ? 'Pi default' : formatModel(selected);
};
