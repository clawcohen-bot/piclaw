import { describe, expect, it } from 'vitest';

import { createSlackConversationKey, stripSlackBotMention } from '../connectors/slack/connector';

describe('slack connector helpers', () => {
  it('creates stable conversation keys', () => {
    expect(createSlackConversationKey('C1')).toBe('slack-C1');
    expect(createSlackConversationKey('C1', '123.456')).toBe('slack-C1-123.456');
  });

  it('strips bot mentions from app mention text', () => {
    expect(stripSlackBotMention('<@U123> hello')).toBe('hello');
    expect(stripSlackBotMention('<@U123> <@U456> hello')).toBe('hello');
  });
});
