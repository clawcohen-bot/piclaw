import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeAuditEvent, type AuditEvent } from './audit';
import { getAuditLogPath } from './storage';

const originalCwd = process.cwd();
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'audit-test-'));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('writeAuditEvent', () => {
  it('appends audit events as json lines', async () => {
    const event: AuditEvent = { type: 'task', timestamp: '2026-01-01T00:00:00.000Z', chatId: 1, userId: 2, rootId: 'root', message: 'hello' };
    await writeAuditEvent(event);
    await writeAuditEvent({ ...event, message: 'bye' });

    const lines = (await readFile(getAuditLogPath(), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toEqual([event, { ...event, message: 'bye' }]);
  });
});
