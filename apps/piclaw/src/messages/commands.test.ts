import { describe, expect, it } from 'vitest';

import { buildHelpText, helpText } from './commands';

describe('helpText', () => {
  it('lists core bot commands only', () => {
    expect(helpText).toContain('Piclaw');
    expect(helpText).toContain('/remember <text>');
    expect(helpText).toContain('/forget - clear saved long memory');
    expect(helpText).toContain('/model - choose Pi model');
    expect(helpText).toContain('/server-restart <service>');
    expect(helpText).not.toContain('/wiki-add');
    expect(helpText).not.toContain('/calendar');
    expect(helpText).not.toContain('/voice');
  });

  it('adds loaded extension commands at the bottom', () => {
    const text = buildHelpText([
      { name: 'start', description: 'Show Piclaw help and runtime paths.' },
      { name: 'wiki-add', description: 'Add text to the wiki inbox.' },
      { name: 'calendar', description: 'Show Google Calendar status.' },
    ]);

    expect(text).toContain('Extension commands:');
    expect(text).toContain('/wiki-add - Add text to the wiki inbox.');
    expect(text).toContain('/calendar - Show Google Calendar status.');
    expect(text).not.toContain('/start - Show Piclaw help and runtime paths.');
  });
});
