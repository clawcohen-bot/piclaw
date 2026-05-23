import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// main.ts starts the Telegram bot at module load, so unit tests do not import it.
describe('main module safety', () => {
  it('keeps startup guarded by TELEGRAM_BOT_TOKEN and exposes command wiring in source', async () => {
    const source = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
    expect(source).toContain("if (!token)");
    expect(source).toContain("bot.command('status'");
    expect(source).toContain("bot.on('voice'");
  });
});
