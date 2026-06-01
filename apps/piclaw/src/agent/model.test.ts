import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authStorage = vi.hoisted(() => ({
  getOAuthProviders: vi.fn(),
  set: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
}));

const registry = vi.hoisted(() => ({
  authStorage,
  getAvailable: vi.fn(),
  getAll: vi.fn(),
  getProviderDisplayName: vi.fn((id: string) => `Provider ${id}`),
  getProviderAuthStatus: vi.fn(),
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  AuthStorage: { create: vi.fn(() => authStorage) },
  ModelRegistry: { create: vi.fn(() => registry) },
}));

import {
  createAuthStorage,
  findAuthProviderOption,
  formatModel,
  formatModelLabel,
  getAllAuthProviderOptions,
  getAvailableModels,
  getChatModelPath,
  getConfiguredProviderCount,
  getConnectedAuthProviderStatuses,
  getSafeAuthStatus,
  getSelectedModelText,
  loginOAuthProvider,
  logoutAuthProvider,
  readSelectedModel,
  readSelectedModelRef,
  setApiKeyCredential,
  writeSelectedModel,
} from './model';

const originalCwd = process.cwd();
let tempDir: string;

const modelA = { provider: 'openai', id: 'gpt', name: 'GPT' } as any;
const modelB = { provider: 'anthropic', id: 'claude', name: 'Claude' } as any;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'model-test-'));
  process.chdir(tempDir);
  vi.clearAllMocks();
  authStorage.getOAuthProviders.mockReturnValue([{ id: 'github', name: 'GitHub' }]);
  authStorage.get.mockReturnValue({ type: 'api_key' });
  authStorage.list.mockReturnValue(['openai']);
  registry.getAvailable.mockReturnValue([modelA, modelB]);
  registry.getAll.mockReturnValue([modelA, modelB]);
  registry.getProviderAuthStatus.mockReturnValue({ configured: true, source: 'env' });
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('model auth helpers', () => {
  it('creates storage, lists auth providers, and finds provider options', () => {
    expect(createAuthStorage()).toBe(authStorage);
    expect(getAllAuthProviderOptions()).toEqual([
      { id: 'openai', name: 'Provider openai', authType: 'api_key' },
      { id: 'anthropic', name: 'Provider anthropic', authType: 'api_key' },
      { id: 'github', name: 'GitHub', authType: 'oauth' },
    ].sort((a, b) => `${a.authType}:${a.name}`.localeCompare(`${b.authType}:${b.name}`)));
    expect(findAuthProviderOption('OPENAI', 'api_key')).toMatchObject({ id: 'openai' });
    expect(findAuthProviderOption('missing')).toBeUndefined();
  });

  it('sets api keys, logs in, logs out, and reports safe auth status', async () => {
    const callbacks = {} as never;
    await loginOAuthProvider('github', callbacks);
    setApiKeyCredential('openai', 'secret');
    logoutAuthProvider('openai');
    expect(authStorage.login).toHaveBeenCalledWith('github', callbacks);
    expect(authStorage.set).toHaveBeenCalledWith('openai', { type: 'api_key', key: 'secret' });
    expect(authStorage.logout).toHaveBeenCalledWith('openai');
    expect(getSafeAuthStatus('openai')).toEqual({ provider: 'openai', name: 'Provider openai', authType: 'api_key', configured: true, source: 'env', modelCount: 1 });
    expect(getConnectedAuthProviderStatuses()).toEqual([expect.objectContaining({ provider: 'openai' })]);
    expect(getConfiguredProviderCount()).toBe(1);
  });
});

describe('model selection helpers', () => {
  it('sorts and formats models', () => {
    expect(getAvailableModels()).toEqual([modelB, modelA]);
    expect(formatModel(modelA)).toBe('openai/gpt');
    expect(formatModelLabel(modelA)).toBe('GPT (openai/gpt)');
  });

  it('reads, writes, and resolves selected models per chat', async () => {
    expect(getChatModelPath(7)).toBe(join(process.cwd(), 'data', 'runtime', 'models', '7.json'));
    expect(await readSelectedModelRef(7)).toBeUndefined();
    expect(await getSelectedModelText(7)).toBe('Pi default');

    await writeSelectedModel(7, modelA);
    expect(JSON.parse(await readFile(getChatModelPath(7), 'utf8'))).toEqual({ provider: 'openai', id: 'gpt' });
    expect(await readSelectedModelRef(7)).toEqual({ provider: 'openai', id: 'gpt' });
    expect(await readSelectedModel(7)).toEqual(modelA);
    expect(await getSelectedModelText(7)).toBe('openai/gpt');

    await writeFile(getChatModelPath(7), '{ bad');
    expect(await readSelectedModelRef(7)).toBeUndefined();
  });
});
