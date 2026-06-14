import {
  formatModel,
  formatModelLabel,
  getAvailableModels,
  getSelectedModelText,
  writeSelectedModel,
} from '../agent/model';
import type { PiclawExtensionAPI } from '../core/extension-api';

type ReplyContext = { reply?: (text: string, extra?: unknown) => Promise<unknown> | unknown };
type CallbackContext = { answerCbQuery?: (message: string) => Promise<unknown> | unknown };

const asReplyContext = (context: unknown): ReplyContext =>
  typeof context === 'object' && context !== null ? context as ReplyContext : {};

const asCallbackContext = (context: unknown): CallbackContext =>
  typeof context === 'object' && context !== null ? context as CallbackContext : {};

const reply = async (context: unknown, text: string, extra?: unknown): Promise<boolean> => {
  const replyContext = asReplyContext(context);
  if (typeof replyContext.reply !== 'function') {
    return false;
  }

  await replyContext.reply(text, extra);
  return true;
};

const answerCallback = async (context: unknown, message: string): Promise<void> => {
  const callbackContext = asCallbackContext(context);
  if (typeof callbackContext.answerCbQuery === 'function') {
    await callbackContext.answerCbQuery(message);
  }
};

export const registerModelExtension = (piclaw: PiclawExtensionAPI): void => {
  piclaw.registerCommand({
    name: 'model',
    description: 'Choose the LLM model for this conversation.',
    handler: async (input) => {
      if (input.conversationId === undefined) {
        return 'Cannot use /model without conversation.';
      }

      const models = getAvailableModels();
      if (models.length === 0) {
        return 'No available models found. Configure Pi auth first.';
      }

      const current = await getSelectedModelText(input.conversationId);
      const text = `Current model: ${current}\n\nChoose a model:`;
      if (await reply(input.context, text, {
        reply_markup: {
          inline_keyboard: models.map((model, index) => [
            { text: formatModelLabel(model).slice(0, 64), callback_data: `model:${index}` },
          ]),
        },
      })) {
        return;
      }

      return [
        `Current model: ${current}`,
        '',
        'Available models:',
        ...models.map((model, index) => `${index + 1}. ${formatModelLabel(model)}`),
      ].join('\n');
    },
  });

  piclaw.registerCallbackAction({
    name: 'model',
    description: 'Select model from an inline button.',
    pattern: /^model:\d+$/,
    handler: async (input) => {
      if (input.conversationId === undefined) {
        await answerCallback(input.context, 'Cannot choose model without conversation');
        return 'Cannot choose model without conversation.';
      }

      const index = Number(input.data.split(':')[1]);
      const model = getAvailableModels()[index];
      if (model === undefined) {
        await answerCallback(input.context, 'Model not found');
        return 'Model list changed. Run /model again.';
      }

      await writeSelectedModel(input.conversationId, model);
      await answerCallback(input.context, 'Model changed');
      return `Model changed to ${formatModel(model)}.`;
    },
  });
};

export default registerModelExtension;
