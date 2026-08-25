import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PlaybackCapabilitiesDto } from './playback.dto';

function capabilities(values: Record<string, unknown>) {
  return plainToInstance(PlaybackCapabilitiesDto, {
    supportedCodecs: ['h264'],
    supportedContainers: ['mp4'],
    ...values,
  });
}

describe('playback tuning capabilities', () => {
  it('accepts every supported buffer and upscale mode', async () => {
    for (const upscaleMode of ['off', 'device', 'server']) {
      for (const bufferProfile of ['low_latency', 'auto', 'stable']) {
        expect(await validate(capabilities({ upscaleMode, bufferProfile }))).toHaveLength(0);
      }
    }
  });

  it('rejects unknown tuning values', async () => {
    expect(await validate(capabilities({ upscaleMode: 'ai', bufferProfile: 'unbounded' }))).toHaveLength(2);
  });
});
