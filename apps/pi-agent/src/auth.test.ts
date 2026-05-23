import { describe, expect, it, vi } from 'vitest';

import { createAuthMiddleware, isAllowedUser } from './auth';
import type { AppConfig } from './config';

const config: AppConfig = {
  telegram: { allowedUserIds: [10, 20] },
  rootPath: '/repo',
  server: { services: [], logFiles: [] },
  voice: { whisperCommand: 'whisper', whisperModel: 'model', ffmpegCommand: 'ffmpeg', extraArgs: [], timeoutMs: 1 },
};

describe('auth helpers', () => {
  it('allows only configured user ids', () => {
    expect(isAllowedUser(config, 10)).toBe(true);
    expect(isAllowedUser(config, 99)).toBe(false);
    expect(isAllowedUser(config, undefined)).toBe(false);
  });

  it('calls next for allowed users and replies for denied users', async () => {
    const next = vi.fn(async () => undefined);
    const allowedReply = vi.fn(async () => undefined);
    await createAuthMiddleware(config)({ from: { id: 20 }, reply: allowedReply } as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(allowedReply).not.toHaveBeenCalled();

    const deniedReply = vi.fn(async () => undefined);
    await createAuthMiddleware(config)({ from: { id: 5 }, reply: deniedReply } as never, next);
    expect(deniedReply).toHaveBeenCalledWith('Access denied.');
  });
});
