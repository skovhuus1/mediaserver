package com.boltbytes.boltbytes_media

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder

class MediaPlaybackService : Service() {
    private lateinit var session: MediaSession
    private var title = "BoltBytes Media"
    private var subtitle = ""
    private var playing = false
    private var buffering = false
    private var positionMs = 0L
    private var durationMs = 0L
    private var playbackRate = 1f

    override fun onCreate() {
        super.onCreate()
        createChannel()
        session = MediaSession(this, "BoltBytesPlayback").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() {
                    PlaybackCommandBus.emit("play")
                }

                override fun onPause() {
                    PlaybackCommandBus.emit("pause")
                }

                override fun onStop() {
                    PlaybackCommandBus.emit("stop")
                }

                override fun onSeekTo(pos: Long) {
                    PlaybackCommandBus.emit("seek", pos)
                }

                override fun onFastForward() {
                    PlaybackCommandBus.emit("forward")
                }

                override fun onRewind() {
                    PlaybackCommandBus.emit("rewind")
                }
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                PlaybackCommandBus.emit("stop")
                stopPlaybackService()
                return START_NOT_STICKY
            }
            ACTION_PLAY_PAUSE -> PlaybackCommandBus.emit(if (playing) "pause" else "play")
            ACTION_FORWARD -> PlaybackCommandBus.emit("forward")
            ACTION_REWIND -> PlaybackCommandBus.emit("rewind")
            ACTION_CLEAR -> {
                stopPlaybackService()
                return START_NOT_STICKY
            }
            ACTION_UPDATE -> {
                title = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "BoltBytes Media" }
                subtitle = intent.getStringExtra(EXTRA_SUBTITLE).orEmpty()
                playing = intent.getBooleanExtra(EXTRA_PLAYING, false)
                buffering = intent.getBooleanExtra(EXTRA_BUFFERING, false)
                positionMs = intent.getLongExtra(EXTRA_POSITION, 0)
                durationMs = intent.getLongExtra(EXTRA_DURATION, 0)
                playbackRate = intent.getFloatExtra(EXTRA_RATE, 1f)
            }
        }
        updateSession()
        startForeground(NOTIFICATION_ID, notification())
        return START_NOT_STICKY
    }

    private fun updateSession() {
        val state = when {
            buffering -> PlaybackState.STATE_BUFFERING
            playing -> PlaybackState.STATE_PLAYING
            else -> PlaybackState.STATE_PAUSED
        }
        session.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, subtitle)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
                .build(),
        )
        session.setPlaybackState(
            PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_SEEK_TO or
                        PlaybackState.ACTION_FAST_FORWARD or PlaybackState.ACTION_REWIND or
                        PlaybackState.ACTION_STOP,
                )
                .setState(state, positionMs, if (playing) playbackRate else 0f)
                .build(),
        )
    }

    private fun notification(): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setContentIntent(open)
            .setOngoing(playing || buffering)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(action(android.R.drawable.ic_media_rew, "10 sek. tilbage", ACTION_REWIND))
            .addAction(action(
                if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (playing) "Pause" else "Afspil",
                ACTION_PLAY_PAUSE,
            ))
            .addAction(action(android.R.drawable.ic_media_ff, "10 sek. frem", ACTION_FORWARD))
            .setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
            .build()
    }

    private fun action(icon: Int, title: String, action: String) = Notification.Action.Builder(
        icon,
        title,
        PendingIntent.getService(
            this,
            action.hashCode(),
            Intent(this, MediaPlaybackService::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
    ).build()

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Afspilning", NotificationManager.IMPORTANCE_LOW),
            )
        }
    }

    private fun stopPlaybackService() {
        session.isActive = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        session.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "boltbytes_playback"
        private const val NOTIFICATION_ID = 5555
        private const val ACTION_UPDATE = "boltbytes.playback.UPDATE"
        private const val ACTION_CLEAR = "boltbytes.playback.CLEAR"
        private const val ACTION_PLAY_PAUSE = "boltbytes.playback.PLAY_PAUSE"
        private const val ACTION_FORWARD = "boltbytes.playback.FORWARD"
        private const val ACTION_REWIND = "boltbytes.playback.REWIND"
        private const val ACTION_STOP = "boltbytes.playback.STOP"
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_SUBTITLE = "subtitle"
        private const val EXTRA_PLAYING = "playing"
        private const val EXTRA_BUFFERING = "buffering"
        private const val EXTRA_POSITION = "position"
        private const val EXTRA_DURATION = "duration"
        private const val EXTRA_RATE = "rate"

        fun update(
            context: Context,
            title: String,
            subtitle: String,
            playing: Boolean,
            buffering: Boolean,
            positionMs: Long,
            durationMs: Long,
            playbackRate: Float,
        ) {
            val intent = Intent(context, MediaPlaybackService::class.java)
                .setAction(ACTION_UPDATE)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_SUBTITLE, subtitle)
                .putExtra(EXTRA_PLAYING, playing)
                .putExtra(EXTRA_BUFFERING, buffering)
                .putExtra(EXTRA_POSITION, positionMs)
                .putExtra(EXTRA_DURATION, durationMs)
                .putExtra(EXTRA_RATE, playbackRate)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, MediaPlaybackService::class.java).setAction(ACTION_CLEAR),
            )
        }
    }
}
