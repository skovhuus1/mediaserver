import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthorizePlaybackDto } from './playback.dto';

describe('AuthorizePlaybackDto TV contract', () => {
  it('accepts the exact typed Flutter TV request', async () => {
    const payload = {
      profileId: '00000000-0000-4000-8000-000000000001',
      mediaId: '00000000-0000-4000-8000-000000000002',
      deviceId: '00000000-0000-4000-8000-000000000003',
      startPositionMs: 0,
      capabilities: {
        screenHeight: 2160,
        devicePixelRatio: 2,
        supportedCodecs: ['h264', 'hevc'],
        supportedAudioCodecs: ['aac', 'ac3', 'eac3'],
        supportedContainers: ['mov', 'mp4', 'matroska', 'mpegts'],
        supportsHdr: true,
        upscaleMode: 'device',
        bufferProfile: 'stable',
      },
    };
    const result = await validate(
      plainToInstance(AuthorizePlaybackDto, payload),
    );
    expect(result).toEqual([]);
  });
});
