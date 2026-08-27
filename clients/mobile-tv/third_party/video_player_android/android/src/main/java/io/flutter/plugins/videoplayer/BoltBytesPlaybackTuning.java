package io.flutter.plugins.videoplayer;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.media3.common.C;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;

/** Media3 playback tuning selected by the BoltBytes client before player creation. */
@UnstableApi
public final class BoltBytesPlaybackTuning {
  static final int AUTO_MIN_BUFFER_MS = 30_000;
  static final int AUTO_MAX_BUFFER_MS = 120_000;
  static final int AUTO_PLAYBACK_BUFFER_MS = 1_500;
  static final int AUTO_REBUFFER_MS = 3_000;
  static final int STABLE_MIN_BUFFER_MS = 30_000;
  static final int STABLE_MAX_BUFFER_MS = 120_000;
  static final int STABLE_PLAYBACK_BUFFER_MS = 2_000;
  static final int STABLE_REBUFFER_MS = 4_000;
  // The Flutter session keeps the lowest rendition forced for the first
  // 30 seconds. Once Auto is unlocked, five seconds of playable media is
  // enough for Media3 to consider an upgrade; the conservative bandwidth
  // fraction below remains the primary protection against oscillation.
  static final int QUALITY_INCREASE_BUFFER_MS = 5_000;
  static final int QUALITY_DECREASE_BUFFER_MS = 25_000;
  static final int QUALITY_RETAIN_BUFFER_MS = 30_000;
  // Leave 45% headroom for Wi-Fi jitter and a transcoder that is still
  // building the on-demand HLS ladder. Media3 remains the only ABR authority.
  static final float BANDWIDTH_FRACTION = 0.55f;

  private BoltBytesPlaybackTuning() {}

  @NonNull
  public static DefaultTrackSelector trackSelector(
      @NonNull Context context, @NonNull VideoPlayerOptions options) {
    AdaptiveTrackSelection.Factory factory = options.boltBytesTvMode
        ? new AdaptiveTrackSelection.Factory(
            QUALITY_INCREASE_BUFFER_MS,
            QUALITY_DECREASE_BUFFER_MS,
            QUALITY_RETAIN_BUFFER_MS,
            BANDWIDTH_FRACTION)
        : new AdaptiveTrackSelection.Factory();
    DefaultTrackSelector selector = new DefaultTrackSelector(context, factory);
    if (options.boltBytesTvMode) {
      selector.setParameters(
          selector.buildUponParameters().setForceLowestBitrate(true).build());
    }
    return selector;
  }

  @NonNull
  public static DefaultLoadControl loadControl(@NonNull VideoPlayerOptions options) {
    switch (options.boltBytesBufferProfile) {
      case "low_latency":
        return new DefaultLoadControl.Builder()
            .setBufferDurationsMs(5_000, 15_000, 750, 1_500)
            .setPrioritizeTimeOverSizeThresholds(true)
            .setBackBuffer(5_000, true)
            .build();
      case "stable":
        return new DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                STABLE_MIN_BUFFER_MS,
                STABLE_MAX_BUFFER_MS,
                STABLE_PLAYBACK_BUFFER_MS,
                STABLE_REBUFFER_MS)
            .setPrioritizeTimeOverSizeThresholds(true)
            .setBackBuffer(30_000, true)
            .build();
      default:
        return new DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                AUTO_MIN_BUFFER_MS,
                AUTO_MAX_BUFFER_MS,
                AUTO_PLAYBACK_BUFFER_MS,
                AUTO_REBUFFER_MS)
            .setPrioritizeTimeOverSizeThresholds(true)
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
