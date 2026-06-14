import { describe, expect, it, vi, beforeEach } from 'vitest';

import { parseConfig } from '../core/config';
import { createPiclawRuntime } from '../core/runtime';
import { registerAuthExtension } from './auth-extension';

const modelMock = vi.hoisted(() => ({
  findAuthProviderOption: vi.fn(),
  getAllAuthProviderOptions: vi.fn(),
  getAvailableModels: vi.fn(),
  getConfiguredProviderCount: vi.fn(),
  getConnectedAuthProviderStatuses: vi.fn(),
  getSafeAuthStatus: vi.fn(),
  loginOAuthProvider: vi.fn(),
  logoutAuthProvider: vi.fn(),
  setApiKeyCredential: vi.fn(),
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

describe('auth extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelMock.getAllAuthProviderOptions.mockReturnValue([
      { id: 'openai', name: 'OpenAI', authType: 'api_key' },
    ]);
    modelMock.getAvailableModels.mockReturnValue(['openai/gpt']);
    modelMock.getConfiguredProviderCount.mockReturnValue(0);
    modelMock.getConnectedAuthProviderStatuses.mockReturnValue([]);
    modelMock.getSafeAuthStatus.mockReturnValue({
      name: 'OpenAI',
      provider: 'openai',
      configured: false,
      authType: 'api_key',
      source: undefined,
      modelCount: 1,
    });
  });

  it('registers auth commands, callbacks, and text input tool', () => {
    const runtime = createRuntime();
    registerAuthExtension(runtime.api);

    expect(runtime.commands.get('login')).toBeDefined();
    expect(runtime.commands.get('logout')).toBeDefined();
    expect(runtime.commands.get('auth-status')).toBeDefined();
    expect(runtime.commands.get('auth-list')).toBeDefined();
    expect(runtime.commands.get('cancel-auth')).toBeDefined();
    expect(runtime.callbacks.get('authlogin')).toBeDefined();
    expect(runtime.callbacks.get('authlogout')).toBeDefined();
    expect(runtime.tools.get('auth.handle-text-input')).toBeDefined();
  });

  it('keeps API key input state inside the extension', async () => {
    const runtime = createRuntime();
    registerAuthExtension(runtime.api);
    modelMock.findAuthProviderOption.mockReturnValue({ id: 'openai', name: 'OpenAI', authType: 'api_key' });

    const reply = vi.fn(async () => undefined);
    await runtime.commands.get('login')?.handler({
      name: 'login',
      args: 'openai',
      rawText: '/login openai',
      conversationId: '123',
      context: { reply },
    });

    expect(reply).toHaveBeenCalledWith('Send the API key for OpenAI.\nI will try to delete your key message.', undefined);

    await expect(runtime.tools.call('auth.handle-text-input', {
      conversationId: '123',
      text: 'secret-key',
    })).resolves.toEqual({ handled: true, deleteMessage: true, response: 'Received key. Saving...' });

    await vi.waitFor(() => {
      expect(modelMock.setApiKeyCredential).toHaveBeenCalledWith('openai', 'secret-key');
    });
    expect(reply).toHaveBeenCalledWith('Saved OpenAI.\nConfigured providers: 0\nAvailable models: 1\nUse /model to choose.', undefined);
  });

  it('reports auth status without Telegram context', async () => {
    const runtime = createRuntime();
    registerAuthExtension(runtime.api);

    expect(await runtime.commands.get('auth-status')?.handler({
      name: 'auth-status',
      args: 'openai',
      rawText: '/auth-status openai',
    })).toContain('OpenAI (openai)');
  });
});
