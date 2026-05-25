import { describe, expect, it } from 'vitest';

import { helpText } from '../commands';

describe('helpText', () => {
  it('lists core bot commands and voice usage', () => {
    expect(helpText).toContain('Piclaw Pi Agent');
    expect(helpText).toContain('/remember <text>');
    expect(helpText).toContain('/forget - clear saved long memory');
    expect(helpText).toContain('/model - choose Pi model');
    expect(helpText).toContain('/wiki-add <text> - add note to Obsidian wiki');
    expect(helpText).toContain('/server-restart <service>');
    expect(helpText).toContain('Voice message - transcribe with Whisper and run as task');
  });
});
