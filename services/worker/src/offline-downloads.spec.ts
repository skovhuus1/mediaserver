import { describe, expect, it } from 'vitest';
import { offlineTranscodeArguments } from './offline-downloads.js';

describe('offline transcode arguments', () => {
  it('creates a bounded Android-compatible 720p MP4', () => {
    const args = offlineTranscodeArguments({
      sourcePath: '/media/source.mkv',
      outputPath: '/transcode/offline/id/media.partial.mp4',
      sourceHeight: 2160,
      qualityHeight: 720,
    });
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
    expect(args).toContain('scale=-2:720');
    expect(args).toContain('+faststart');
    expect(args.at(-1)).toBe('/transcode/offline/id/media.partial.mp4');
  });

  it('does not upscale a smaller source', () => {
    const args = offlineTranscodeArguments({
      sourcePath: '/media/source.mp4',
      outputPath: '/transcode/offline/id/media.partial.mp4',
      sourceHeight: 480,
      qualityHeight: 1080,
    });
    expect(args).not.toContain('-vf');
  });
});
