import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['apps/pi-agent/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage/pi-agent',
      include: ['apps/pi-agent/src/**/*.ts'],
      exclude: [
        'apps/pi-agent/src/**/*.test.ts',
        'apps/pi-agent/src/main.ts',
        'apps/pi-agent/src/agent-runner.ts',
        'apps/pi-agent/src/connectors/telegram/connector.ts',
        'apps/pi-agent/src/connectors/slack/connector.ts',
        'apps/pi-agent/src/pi-task.ts',
        'apps/pi-agent/src/model.ts',
        'apps/pi-agent/src/skills.ts',
        'apps/pi-agent/src/types.ts',
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
