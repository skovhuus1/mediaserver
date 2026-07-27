import { Injectable } from '@nestjs/common';

type DeviceCapabilities = {
  supportsCodecs?: string[];
};

@Injectable()
export class PlaybackDecisionService {
  async chooseMethod(mediaProfile: any, device: DeviceCapabilities, entitlements: Record<string, unknown>) {
    const codec = mediaProfile?.codec ?? 'h264';
    const supported = Boolean(device?.supportsCodecs?.length)
      ? device.supportsCodecs.includes(codec)
      : true;

    if (entitlements.allowDirectPlay === true && supported) {
      return 'direct_play';
    }

    if (entitlements.allowDirectStream === true) {
      return 'direct_stream';
    }

    if (entitlements.allowVideoTranscode === true) {
      return 'transcode';
    }

    return 'transcode';
  }
}
