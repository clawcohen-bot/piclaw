import type { PiclawCommand } from '@piclaw/sdk';

export const coreCommandLines = [
  '/remember <text>',
  '/forget - clear saved long memory',
  '/memory - show long memory and session compact memory',
  '/usage - show estimated context usage',
  '/new - start fresh context',
  '/status - bot status',
  '/skills - show available skills',
  '/mode - show current mode',
  '/model - choose Pi model',
  '/login - connect LLM auth',
  '/logout - remove LLM auth',
  '/auth-status - show LLM auth status',
  '/auth-list - list auth providers',
  '/cancel-auth - cancel pending auth',
  '/mode agent - full access',
  '/mode ask - read-only',
  '/reload - restart bot and load new code/config',
  '/cancel - cancel active task',
  '/server-status',
  '/server-services',
  '/server-logs <name>',
  '/server-restart <service>',
];

export const coreCommandNames = new Set([
  'start',
  ...coreCommandLines
    .filter((line) => line.startsWith('/'))
    .map((line) => line.slice(1).split(/\s/, 1)[0]),
]);

const formatExtensionCommand = (command: Pick<PiclawCommand, 'name' | 'description'>): string => (
  command.description.length === 0 ? `/${command.name}` : `/${command.name} - ${command.description}`
);

export const buildHelpText = (commands: Pick<PiclawCommand, 'name' | 'description'>[] = []): string => {
  const extensionCommandLines = commands
    .filter((command) => !coreCommandNames.has(command.name))
    .map(formatExtensionCommand);

  return [
    'Piclaw',
    '',
    'Commands:',
    ...coreCommandLines,
    '',
    'Extension commands:',
    ...(extensionCommandLines.length === 0 ? ['No extension commands loaded.'] : extensionCommandLines),
  ].join('\n');
};

export const helpText = buildHelpText();
