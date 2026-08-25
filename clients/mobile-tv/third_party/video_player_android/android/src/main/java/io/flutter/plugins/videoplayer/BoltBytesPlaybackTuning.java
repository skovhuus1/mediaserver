package io.flutter.plugins.videoplayer;

import androidx.annotation.NonNull;
import androidx.media3.common.C;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;

/** Media3 playback tuning selected by the BoltBytes client before player creation. */
@UnstableApi
public final class BoltBytesPlaybackTuning {
  private BoltBytesPlaybackTuning() {}

  @NonNull
  public static DefaultLoadControl loadControl(@NonNull VideoPlayerOptions options) {
    switch (options.boltBytesBufferProfile) {
      case "low_latency":
        return new DefaultLoadControl.Builder()
            .setBufferDurationsMs(5_000, 15_000, 750, 1_500)
            .setBackBuffer(5_000, true)
            .build();
      case "stable":
        return new DefaultLoadControl.Builder()
            .setBufferDurationsMs(60_000, 180_000, 5_000, 10_000)
            .setBackBuffer(60_000, true)
            .build();
      default:
        return new DefaultLoadControl.Builder()
            .setBufferDurationsMs(30_000, 120_000, 2_500, 5_000)
            .setBackBuffer(30_000, true)
            .build();
    }
  }

  public static void applyVideoScaling(
      @NonNull ExoPlayer player, @NonNull VideoPlayerOptions options) {
    if ("device".equals(options.boltBytesUpscaleMode)) {
      player.setVideoScalingMode(C.VIDEO_SCALING_MODE_SCALE_TO_FIT);
    }
  }
}
