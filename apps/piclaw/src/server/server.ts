import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { AppConfig } from '../core/config';
import { truncateText } from '../messages/text';

const execFileAsync = promisify(execFile);

export const getServerStatus = async (): Promise<string> => {
  const [uptime, memory, disk] = await Promise.all([
    execFileAsync('uptime', []),
    execFileAsync('free', ['-h']),
    execFileAsync('df', ['-h', '/']),
  ]);

  return ['Uptime:', uptime.stdout.trim(), '', 'Memory:', memory.stdout.trim(), '', 'Disk:', disk.stdout.trim()].join('\n');
};

export const formatServices = (config: AppConfig): string => {
  if (config.server.services.length === 0) {
    return 'No services configured.';
  }

  return config.server.services.map((service) => `- ${service}`).join('\n');
};

export const readAllowedLogs = async (config: AppConfig, name: string): Promise<string> => {
  if (config.server.services.includes(name)) {
    const result = await execFileAsync('journalctl', ['-u', name, '-n', '80', '--no-pager']);
    return truncateText(result.stdout.trim() || result.stderr.trim(), 3500);
  }

  if (config.server.logFiles.includes(name)) {
    const content = await readFile(name, 'utf8');
    return truncateText(content.split('\n').slice(-80).join('\n'), 3500);
  }

  throw new Error(`Log is not allowed: ${name}`);
};

export const restartAllowedService = async (config: AppConfig, service: string): Promise<string> => {
  if (!config.server.services.includes(service)) {
    throw new Error(`Service is not allowed: ${service}`);
  }

  const result = await execFileAsync('systemctl', ['restart', service]);
  return result.stdout.trim() || `Restarted ${service}`;
};
