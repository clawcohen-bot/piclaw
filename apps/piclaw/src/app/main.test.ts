import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// main.ts starts the Telegram bot at module load, so unit tests do not import it.
describe('main module safety', () => {
  it('keeps startup delegated to the Telegram connector', async () => {
    const mainSource = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
    const telegramSource = await readFile(new URL('../connectors/telegram/connector.ts', import.meta.url), 'utf8');

    expect(mainSource).toContain('createTelegramConnector(config)');
    expect(mainSource).toContain('createSlackConnector(config)');
    expect(mainSource).toContain('createCliConnector(config)');
    expect(telegramSource).toContain("Missing TELEGRAM_BOT_TOKEN");
    expect(telegramSource).toContain("bot.command('status'");
    expect(telegramSource).toContain("bot.on('voice'");
  });
});
