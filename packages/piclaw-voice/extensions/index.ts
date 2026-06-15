import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { PiclawExtensionAPI } from '@piclaw/sdk';

const execFileAsync = promisify(execFile);

type VoiceConfig = {
  whisperCommand: string;
  whisperModel: string;
  ffmpegCommand: string;
  extraArgs: string[];
  timeoutMs: number;
};

const getVoiceConfig = (piclaw: PiclawExtensionAPI): VoiceConfig => {
  const config = (piclaw.config as { voice?: VoiceConfig }).voice;
  if (config === undefined) {
    throw new Error('Voice config is not available');
  }
  return config;
};

const convertToWav = async (inputPath: string, outputPath: string, voiceConfig: VoiceConfig): Promise<void> => {
  await execFileAsync(voiceConfig.ffmpegCommand, ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath], {
    timeout: voiceConfig.timeoutMs,
    maxBuffer: 1024 * 1024 * 10,
  });
};

const readTranscript = async (transcriptPath: string, stdout: string): Promise<string> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return (await readFile(transcriptPath, 'utf8')).trim();
    } catch {
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return stdout.trim();
};

const transcribeVoiceBuffer = async (buffer: Buffer, voiceConfig: VoiceConfig): Promise<string> => {
  const tempDir = await mkdtemp(join(tmpdir(), 'telegram-pi-voice-'));
  const inputPath = join(tempDir, 'voice.oga');
  const wavPath = join(tempDir, 'voice.wav');
  const transcriptBasePath = join(tempDir, 'transcript');
  const transcriptPath = `${transcriptBasePath}.txt`;

  try {
    await writeFile(inputPath, buffer);
    await convertToWav(inputPath, wavPath, voiceConfig);
    const result = await execFileAsync(voiceConfig.whisperCommand, ['-m', voiceConfig.whisperModel, '-f', wavPath, '-otxt', '-of', transcriptBasePath, ...voiceConfig.extraArgs], {
      timeout: voiceConfig.timeoutMs,
      maxBuffer: 1024 * 1024 * 10,
    });
    const transcript = await readTranscript(transcriptPath, result.stdout);
    if (transcript === '') throw new Error('Whisper returned an empty transcript');
    return transcript;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

const downloadTelegramFile = async (fileUrl: URL): Promise<Buffer> => {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Telegram file download failed: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
};

export default function (piclaw: PiclawExtensionAPI) {
  piclaw.registerTool({
    name: 'voice.transcribe-buffer',
    description: 'Transcribe an audio buffer with the configured local Whisper command.',
    handler: async (input: any) => transcribeVoiceBuffer(Buffer.from(input?.buffer ?? []), getVoiceConfig(piclaw)),
  });

  piclaw.registerTool({
    name: 'voice.transcribe-telegram-file',
    description: 'Download and transcribe a Telegram voice file.',
    handler: async (input: any) => {
      if (typeof input?.getFileLink !== 'function' || typeof input?.fileId !== 'string') {
        throw new Error('Telegram file id and getFileLink callback are required');
      }
      return transcribeVoiceBuffer(await downloadTelegramFile(await input.getFileLink(input.fileId)), getVoiceConfig(piclaw));
    },
  });

  piclaw.registerCommand({
    name: 'voice',
    description: 'Show voice package status.',
    handler: () => 'Voice package loaded. Send a Telegram voice message to transcribe it.',
  });
}
