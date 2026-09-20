import { SpeechClient } from '@google-cloud/speech';
import * as fs from 'fs';
import * as path from 'path';

export class SpeechService {
  private client: SpeechClient;

  constructor() {
    this.client = new SpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    const audio = {
      content: audioBuffer.toString('base64')
    };

    const config = {
      encoding: 'OGG_OPUS' as const,
      sampleRateHertz: 16000,
      languageCode: 'pt-BR',
      alternativeLanguageCodes: ['en-US'],
      enableAutomaticPunctuation: true,
      model: 'latest_long'
    };

    const request = {
      audio,
      config
    };

    try {
      const [response] = await this.client.recognize(request);
      const transcription = response.results
        ?.map(result => result.alternatives?.[0]?.transcript || '')
        .join('\n') || '';

      return transcription;
    } catch (error) {
      console.error('Erro na transcrição:', error);
      throw new Error('Falha ao transcrever áudio');
    }
  }

  async transcribeFile(filePath: string): Promise<string> {
    const audioBuffer = fs.readFileSync(filePath);
    return this.transcribeAudio(audioBuffer);
  }

  getAudioDuration(audioBuffer: Buffer): number {
    const sizeInBytes = audioBuffer.length;
    const durationInSeconds = sizeInBytes / (16000 * 2);
    return Math.ceil(durationInSeconds / 60);
  }
}
