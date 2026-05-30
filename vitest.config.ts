import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['apps/piclaw/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage/piclaw',
      include: ['apps/piclaw/src/**/*.ts'],
      exclude: [
        'apps/piclaw/src/**/*.test.ts',
        'apps/piclaw/src/app/main.ts',
        'apps/piclaw/src/agent/agent-runner.ts',
        'apps/piclaw/src/connectors/telegram/connector.ts',
        'apps/piclaw/src/connectors/slack/connector.ts',
        'apps/piclaw/src/connectors/cli/connector.ts',
        'apps/piclaw/src/agent/pi-task.ts',
        'apps/piclaw/src/agent/model.ts',
        'apps/piclaw/src/features/skills/skills.ts',
        'apps/piclaw/src/core/types.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
