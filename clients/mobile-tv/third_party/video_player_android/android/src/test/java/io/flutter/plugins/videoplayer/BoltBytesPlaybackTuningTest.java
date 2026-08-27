package io.flutter.plugins.videoplayer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.test.core.app.ApplicationProvider;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@UnstableApi
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class BoltBytesPlaybackTuningTest {
  @Test
  public void tvSelectorStartsAtLowestBitrate() {
    Context context = ApplicationProvider.getApplicationContext();
    VideoPlayerOptions options = new VideoPlayerOptions();
    options.boltBytesTvMode = true;

    DefaultTrackSelector selector = BoltBytesPlaybackTuning.trackSelector(context, options);

    assertTrue(selector.getParameters().forceLowestBitrate);
    assertEquals(5_000, BoltBytesPlaybackTuning.QUALITY_INCREASE_BUFFER_MS);
    assertEquals(0.55f, BoltBytesPlaybackTuning.BANDWIDTH_FRACTION, 0.0f);
    assertEquals(3_000, BoltBytesPlaybackTuning.AUTO_REBUFFER_MS);
    assertEquals(4_000, BoltBytesPlaybackTuning.STABLE_REBUFFER_MS);
  }
}
