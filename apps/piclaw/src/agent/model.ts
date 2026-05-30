import { AuthStorage, ModelRegistry } from '@earendil-works/pi-coding-agent';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureParentDir, getAppDir, getPiSdkDir, type ConversationKey } from '../core/storage';

type PiModel = ReturnType<ModelRegistry['getAll']>[number];

type SelectedModel = {
  provider: string;
  id: string;
};

export type AuthProviderOption = {
  id: string;
  name: string;
  authType: 'oauth' | 'api_key';
};

export type SafeAuthStatus = {
  provider: string;
  name: string;
  authType?: 'oauth' | 'api_key';
  configured: boolean;
  source?: string;
  modelCount: number;
};

const formatStorageKey = (key: ConversationKey): string =>
  typeof key === 'number' ? String(key) : encodeURIComponent(key);

export const getChatModelPath = (conversationKey: ConversationKey): string => join(getAppDir(), 'models', `${formatStorageKey(conversationKey)}.json`);

export const createAuthStorage = (): AuthStorage => AuthStorage.create(join(getPiSdkDir(), 'auth.json'));

const createModelRegistry = (): ModelRegistry =>
  ModelRegistry.create(createAuthStorage(), join(getPiSdkDir(), 'models.json'));

export const getAvailableModels = (): PiModel[] =>
  createModelRegistry()
    .getAvailable()
    .sort((a, b) => `${a.provider}/${a.name}`.localeCompare(`${b.provider}/${b.name}`));

export const getAllAuthProviderOptions = (): AuthProviderOption[] => {
  const registry = createModelRegistry();
  const authStorage = registry.authStorage;
  const oauthProviders = authStorage.getOAuthProviders();
  const options: AuthProviderOption[] = oauthProviders.map((provider) => ({
    id: provider.id,
    name: provider.name,
    authType: 'oauth',
  }));

  const modelProviderIds = [...new Set(registry.getAll().map((model) => model.provider))].sort();
  for (const providerId of modelProviderIds) {
    options.push({
      id: providerId,
      name: registry.getProviderDisplayName(providerId),
      authType: 'api_key',
    });
  }

  const seen = new Set<string>();
  return options
    .filter((option) => {
      const key = `${option.authType}:${option.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => `${a.authType}:${a.name}`.localeCompare(`${b.authType}:${b.name}`));
};

export const findAuthProviderOption = (providerId: string, authType?: AuthProviderOption['authType']): AuthProviderOption | undefined => {
  const normalized = providerId.toLowerCase();
  const options = getAllAuthProviderOptions();
  return options.find(
    (option) =>
      option.id.toLowerCase() === normalized && (authType === undefined || option.authType === authType),
  );
};

export const setApiKeyCredential = (providerId: string, apiKey: string): void => {
  createAuthStorage().set(providerId, { type: 'api_key', key: apiKey });
};

export const loginOAuthProvider = async (
  providerId: string,
  callbacks: Parameters<AuthStorage['login']>[1],
): Promise<void> => {
  await createAuthStorage().login(providerId as Parameters<AuthStorage['login']>[0], callbacks);
};

export const logoutAuthProvider = (providerId: string): void => {
  createAuthStorage().logout(providerId);
};

export const getSafeAuthStatus = (providerId: string): SafeAuthStatus => {
  const registry = createModelRegistry();
  const authStorage = registry.authStorage;
  const credential = authStorage.get(providerId);
  const status = registry.getProviderAuthStatus(providerId);
  return {
    provider: providerId,
    name: registry.getProviderDisplayName(providerId),
    authType: credential?.type,
    configured: status.configured,
    source: status.source,
    modelCount: registry.getAll().filter((model) => model.provider === providerId).length,
  };
};

export const getConnectedAuthProviderStatuses = (): SafeAuthStatus[] =>
  createAuthStorage()
    .list()
    .map(getSafeAuthStatus)
    .sort((a, b) => a.name.localeCompare(b.name));

export const getConfiguredProviderCount = (): number => createAuthStorage().list().length;

export const formatModel = (model: PiModel): string => `${model.provider}/${model.id}`;

export const formatModelLabel = (model: PiModel): string => `${model.name} (${model.provider}/${model.id})`;

export const readSelectedModelRef = async (conversationKey: ConversationKey): Promise<SelectedModel | undefined> => {
  try {
    const raw = await readFile(getChatModelPath(conversationKey), 'utf8');
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

export const readSelectedModel = async (conversationKey: ConversationKey): Promise<PiModel | undefined> => {
  const selected = await readSelectedModelRef(conversationKey);
  if (selected === undefined) {
    return undefined;
  }

  return getAvailableModels().find((model) => model.provider === selected.provider && model.id === selected.id);
};

export const writeSelectedModel = async (conversationKey: ConversationKey, model: PiModel): Promise<void> => {
  const path = getChatModelPath(conversationKey);
  await ensureParentDir(path);
  await writeFile(path, `${JSON.stringify({ provider: model.provider, id: model.id }, null, 2)}\n`);
};

export const getSelectedModelText = async (conversationKey: ConversationKey): Promise<string> => {
  const selected = await readSelectedModel(conversationKey);
  return selected === undefined ? 'Pi default' : formatModel(selected);
};
