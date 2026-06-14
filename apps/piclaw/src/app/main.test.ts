import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// main.ts starts the Telegram bot at module load, so unit tests do not import it.
describe('main module safety', () => {
  it('keeps startup delegated to the Telegram connector', async () => {
    const mainSource = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
    const telegramSource = await readFile(new URL('../connectors/telegram/connector.ts', import.meta.url), 'utf8');
    const telegramFeatureSource = await readFile(new URL('../features/telegram/telegram-feature-handlers.ts', import.meta.url), 'utf8');

    expect(mainSource).toContain('createTelegramConnector(config)');
    expect(mainSource).toContain('createSlackConnector(config)');
    expect(mainSource).toContain('createCliConnector(config)');
    expect(telegramSource).toContain("Missing TELEGRAM_BOT_TOKEN");
    expect(telegramSource).toContain('registerTelegramFeatureHandlers(bot, config, context.runtime)');
    expect(telegramSource).not.toContain("bot.command('status'");
    expect(telegramSource).not.toContain("bot.on('voice'");
    expect(telegramFeatureSource).toContain("registerTelegramCommand('status'");
    expect(telegramFeatureSource).not.toContain("bot.command('status'");
    expect(telegramFeatureSource).toContain("bot.on('voice'");
  });
});
