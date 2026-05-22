import { appendFile } from 'node:fs/promises';

import { ensureParentDir, getAuditLogPath } from './storage';

export type AuditEvent = {
  type: string;
  timestamp: string;
  chatId?: number;
  userId?: number;
  rootId?: string;
  message: string;
};

export const writeAuditEvent = async (event: AuditEvent): Promise<void> => {
  const path = getAuditLogPath();
  await ensureParentDir(path);
  await appendFile(path, `${JSON.stringify(event)}\n`, 'utf8');
};
