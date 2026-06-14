import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { VoiceConfig } from '../../core/config';

const execFileAsync = promisify(execFile);

const convertToWav = async (inputPath: string, outputPath: string, voiceConfig: VoiceConfig): Promise<void> => {
  await execFileAsync(
    voiceConfig.ffmpegCommand,
    ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath],
    {
      timeout: voiceConfig.timeoutMs,
      maxBuffer: 1024 * 1024 * 10,
    },
  );
};

const readTranscript = async (transcriptPath: string, stdout: string): Promise<string> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return (await readFile(transcriptPath, 'utf8')).trim();
    } catch {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  return stdout.trim();
};

export const transcribeVoiceBuffer = async (buffer: Buffer, voiceConfig: VoiceConfig): Promise<string> => {
  const tempDir = await mkdtemp(join(tmpdir(), 'telegram-pi-voice-'));
  const inputPath = join(tempDir, 'voice.oga');
  const wavPath = join(tempDir, 'voice.wav');
  const transcriptBasePath = join(tempDir, 'transcript');
  const transcriptPath = `${transcriptBasePath}.txt`;

  try {
    await writeFile(inputPath, buffer);
    await convertToWav(inputPath, wavPath, voiceConfig);

    const result = await execFileAsync(
      voiceConfig.whisperCommand,
      ['-m', voiceConfig.whisperModel, '-f', wavPath, '-otxt', '-of', transcriptBasePath, ...voiceConfig.extraArgs],
      {
        timeout: voiceConfig.timeoutMs,
        maxBuffer: 1024 * 1024 * 10,
      },
    );

    const transcript = await readTranscript(transcriptPath, result.stdout);
    if (transcript === '') {
      throw new Error('Whisper returned an empty transcript');
    }

    return transcript;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

export const downloadTelegramFile = async (fileUrl: URL): Promise<Buffer> => {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Telegram file download failed: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};
