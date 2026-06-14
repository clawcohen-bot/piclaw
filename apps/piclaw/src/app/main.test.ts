import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// main.ts starts the Telegram bot at module load, so unit tests do not import it.
describe('main module safety', () => {
  it('keeps startup delegated to the Telegram connector', async () => {
    const mainSource = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
    const telegramSource = await readFile(new URL('../connectors/telegram/connector.ts', import.meta.url), 'utf8');
    const telegramRuntimeSource = await readFile(new URL('../connectors/telegram/runtime-handlers.ts', import.meta.url), 'utf8');

    expect(mainSource).toContain('createTelegramConnector(config)');
    expect(mainSource).toContain('createSlackConnector(config)');
    expect(mainSource).toContain('createCliConnector(config)');
    expect(telegramSource).toContain("Missing TELEGRAM_BOT_TOKEN");
    expect(telegramSource).toContain('registerTelegramRuntimeHandlers(bot, config, context.runtime)');
    expect(telegramSource).not.toContain("bot.command('status'");
    expect(telegramSource).not.toContain("bot.on('voice'");
    expect(telegramRuntimeSource).toContain("registerTelegramCommand('status'");
    expect(telegramRuntimeSource).toContain('registerTelegramCallback');
    expect(telegramRuntimeSource).not.toContain("bot.command('status'");
    expect(telegramRuntimeSource).not.toContain('bot.action');
    expect(telegramRuntimeSource).toContain("bot.on('voice'");
  });
});
