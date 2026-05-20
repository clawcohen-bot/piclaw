import { exec } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { resolveWorkspacePath } from './path-safety';
import { truncateText } from './text';

const execAsync = promisify(exec);

type TextContent = {
  type: 'text';
  text: string;
};

type TextToolResult = {
  content: TextContent[];
  details: Record<string, never>;
};

type CreateServerToolsInput = {
  rootPath: string;
};

const textResult = (message: string): TextToolResult => ({
  content: [{ type: 'text', text: message }],
  details: {},
});

const denied = (message: string): TextToolResult => textResult(message);

export const createServerTools = (input: CreateServerToolsInput) => {
  const serverBash = defineTool({
    name: 'server_bash',
    label: 'Server Bash',
    description: 'Run a shell command under the configured root.',
    parameters: Type.Object({
      command: Type.String({ description: 'Shell command to run' }),
    }),
    execute: async (_toolCallId, params) => {
      const result = await execAsync(params.command, {
        cwd: input.rootPath,
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      });

      return textResult(
        truncateText([result.stdout, result.stderr].filter(Boolean).join('\n'), 6000) || 'Command finished.',
      );
    },
  });

  const serverWrite = defineTool({
    name: 'server_write_file',
    label: 'Server Write File',
    description: 'Write a file inside the configured root.',
    parameters: Type.Object({
      path: Type.String({ description: 'Root-relative or absolute path inside the configured root' }),
      content: Type.String({ description: 'Full file content' }),
    }),
    execute: async (_toolCallId, params) => {
      const resolvedPath = resolveWorkspacePath(input.rootPath, params.path);
      if (resolvedPath === undefined) {
        return denied(`Blocked write outside configured root: ${params.path}`);
      }

      await mkdir(dirname(resolvedPath), { recursive: true });
      await writeFile(resolvedPath, params.content, 'utf8');

      return textResult(`Wrote ${resolvedPath}`);
    },
  });

  const serverEdit = defineTool({
    name: 'server_edit_replace',
    label: 'Server Edit Replace',
    description: 'Replace exact text in a file inside the configured root.',
    parameters: Type.Object({
      path: Type.String({ description: 'Root-relative or absolute path inside the configured root' }),
      oldText: Type.String({ description: 'Exact text to replace' }),
      newText: Type.String({ description: 'Replacement text' }),
    }),
    execute: async (_toolCallId, params) => {
      const resolvedPath = resolveWorkspacePath(input.rootPath, params.path);
      if (resolvedPath === undefined) {
        return denied(`Blocked edit outside configured root: ${params.path}`);
      }

      const current = await readFile(resolvedPath, 'utf8');
      if (!current.includes(params.oldText)) {
        return denied('Old text was not found exactly once.');
      }

      const firstIndex = current.indexOf(params.oldText);
      const secondIndex = current.indexOf(params.oldText, firstIndex + params.oldText.length);
      if (secondIndex !== -1) {
        return denied('Old text appears more than once. Edit was blocked.');
      }

      await writeFile(resolvedPath, current.replace(params.oldText, params.newText), 'utf8');

      return textResult(`Edited ${resolvedPath}`);
    },
  });

  return [serverBash, serverWrite, serverEdit];
};
