import { downloadTelegramFile, transcribeVoiceBuffer } from '../../../apps/piclaw/src/features/voice/voice';

export default function (piclaw: any) {
  piclaw.registerTool({
    name: 'voice.transcribe-buffer',
    description: 'Transcribe an audio buffer with the configured local Whisper command.',
    handler: async (input: any) => transcribeVoiceBuffer(Buffer.from(input?.buffer ?? []), piclaw.config.voice),
  });

  piclaw.registerTool({
    name: 'voice.transcribe-telegram-file',
    description: 'Download and transcribe a Telegram voice file.',
    handler: async (input: any) => {
      if (typeof input?.getFileLink !== 'function' || typeof input?.fileId !== 'string') {
        throw new Error('Telegram file id and getFileLink callback are required');
      }
      const fileLink = await input.getFileLink(input.fileId);
      const voiceBuffer = await downloadTelegramFile(fileLink);
      return transcribeVoiceBuffer(voiceBuffer, piclaw.config.voice);
    },
  });

  piclaw.registerCommand({
    name: 'voice',
    description: 'Show voice package status.',
    handler: () => 'Voice package loaded. Send a Telegram voice message to transcribe it.',
  });
}
