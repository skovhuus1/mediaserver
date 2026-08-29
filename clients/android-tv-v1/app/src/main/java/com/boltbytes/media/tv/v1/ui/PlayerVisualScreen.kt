package com.boltbytes.media.tv.v1.ui

import android.view.KeyEvent as AndroidKeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.Forward30
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Hd
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.Subtitles
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@Composable
fun PlayerVisualScreen(
    onBack: () -> Unit,
    episodeIndex: Int = 3,
    previewMode: Boolean = false,
) {
    var activeOption by remember { mutableStateOf<V1PlayerOptionType?>(null) }
    var controlsVisible by remember { mutableStateOf(true) }
    var playing by remember { mutableStateOf(true) }
    var positionSeconds by remember { mutableIntStateOf(1902) }
    var seekFeedback by remember { mutableStateOf<Int?>(null) }
    var subtitle by remember { mutableStateOf("Dansk") }
    var subtitleOffsetMs by remember { mutableIntStateOf(400) }
    var audio by remember { mutableStateOf("Dansk") }
    var quality by remember { mutableStateOf("Auto") }
    var upscaling by remember { mutableStateOf("TV") }
    val rootFocus = remember { FocusRequester() }
    val pauseFocus = remember { FocusRequester() }
    val durationSeconds = 3120

    BackHandler {
        when {
            activeOption != null -> activeOption = null
            controlsVisible -> controlsVisible = false
            else -> onBack()
        }
    }

    LaunchedEffect(controlsVisible, activeOption, previewMode) {
        if (controlsVisible && activeOption == null) {
            pauseFocus.requestFocus()
            if (!previewMode) {
                delay(5000)
                controlsVisible = false
            }
        }
    }

    LaunchedEffect(controlsVisible) {
        if (!controlsVisible) {
            delay(30)
            rootFocus.requestFocus()
        }
    }

    LaunchedEffect(seekFeedback) {
        if (seekFeedback != null) {
            delay(900)
            seekFeedback = null
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(rootFocus)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown || controlsVisible || activeOption != null) {
                    false
                } else {
                    when (event.nativeKeyEvent.keyCode) {
                        AndroidKeyEvent.KEYCODE_DPAD_LEFT -> {
                            positionSeconds = (positionSeconds - 10).coerceAtLeast(0)
                            seekFeedback = -10
                            true
                        }
                        AndroidKeyEvent.KEYCODE_DPAD_RIGHT -> {
                            positionSeconds = (positionSeconds + 30).coerceAtMost(durationSeconds)
                            seekFeedback = 30
                            true
                        }
                        AndroidKeyEvent.KEYCODE_DPAD_CENTER,
                        AndroidKeyEvent.KEYCODE_ENTER,
                        AndroidKeyEvent.KEYCODE_BUTTON_A,
                        -> {
                            controlsVisible = true
                            true
                        }
                        else -> false
                    }
                }
            }
            .focusable(),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawRect(
                brush = Brush.linearGradient(
                    listOf(Color(0xFF143744), Color(0xFF47202A), Color(0xFF080A0D)),
                ),
            )
            drawCircle(
                color = Color(0xFF6BB4C6).copy(alpha = 0.18f),
                radius = size.minDimension * 0.44f,
                center = Offset(size.width * 0.69f, size.height * 0.35f),
            )
            drawCircle(
                color = Color.Black.copy(alpha = 0.36f),
                radius = size.minDimension * 0.29f,
                center = Offset(size.width * 0.72f, size.height * 0.39f),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.Black.copy(alpha = 0.54f),
                            Color.Transparent,
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.88f),
                        ),
                    ),
                ),
        )

        if (controlsVisible) Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 18.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                V1FocusSurface(
                    onClick = onBack,
                    modifier = Modifier.size(36.dp),
                    radius = 50.dp,
                ) { focused ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.ArrowBack,
                            contentDescription = "Tilbage",
                            tint = if (focused) V1Colors.Gold else Color.White,
                            modifier = Modifier.size(17.dp),
                        )
                    }
                }
                Column {
                    Text("The Sinner", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                    Text("Sæson 2 · Afsnit ${episodeIndex + 1} · Part ${episodeIndex + 1}", color = Color.White.copy(alpha = 0.65f), fontSize = 8.sp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                V1Pill("4K", color = V1Colors.Cyan, emphasized = true)
                V1Pill("HDR", color = V1Colors.Green, emphasized = true)
                V1Pill("ATMOS", color = V1Colors.Gold, emphasized = true)
            }
        }

        if (controlsVisible) V1FocusSurface(
            onClick = {},
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 24.dp),
            radius = 50.dp,
            background = Brush.horizontalGradient(listOf(Color(0xE8F3F5F7), Color.White)),
            focusedBackground = Brush.horizontalGradient(listOf(Color.White, V1Colors.Gold)),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 15.dp, vertical = 9.dp),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Spring intro over", color = V1Colors.Background, fontSize = 9.sp, fontWeight = FontWeight.Black)
                Text("OK", color = V1Colors.Background.copy(alpha = 0.58f), fontSize = 7.sp, fontWeight = FontWeight.Bold)
            }
        }

        if (controlsVisible) V1GlassPanel(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 24.dp)
                .height(122.dp),
            radius = 20.dp,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 20.dp, vertical = 14.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(formatPlayerTime(positionSeconds), color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        V1StatusDot("BUFFER 48 SEK.", V1Colors.Cyan)
                        V1StatusDot("STABIL", V1Colors.Green)
                    }
                    Text("-${formatPlayerTime(durationSeconds - positionSeconds)}", color = Color.White.copy(alpha = 0.7f), fontSize = 9.sp)
                }
                Spacer(Modifier.height(8.dp))
                PlayerTimeline(positionSeconds.toFloat() / durationSeconds)
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        PlayerControl(Icons.Rounded.Replay10, "10 sek.", onClick = { positionSeconds = (positionSeconds - 10).coerceAtLeast(0) })
                        PlayerControl(
                            Icons.Rounded.Pause,
                            if (playing) "Pause" else "Fortsæt",
                            modifier = Modifier.focusRequester(pauseFocus),
                            primary = true,
                            onClick = { playing = !playing },
                        )
                        PlayerControl(Icons.Rounded.Forward30, "30 sek.", onClick = { positionSeconds = (positionSeconds + 30).coerceAtMost(durationSeconds) })
                        PlayerControl(Icons.Rounded.SkipNext, "Næste", onClick = {})
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        PlayerControl(
                            Icons.Rounded.Subtitles,
                            "$subtitle · ${"%+.1fs".format(subtitleOffsetMs / 1000f)}",
                            onClick = { activeOption = V1PlayerOptionType.Subtitles },
                        )
                        PlayerControl(
                            Icons.Rounded.GraphicEq,
                            "$audio 5.1",
                            onClick = { activeOption = V1PlayerOptionType.Audio },
                        )
                        PlayerControl(
                            Icons.Rounded.Hd,
                            "$quality · 4K",
                            onClick = { activeOption = V1PlayerOptionType.Quality },
                        )
                        PlayerControl(
                            Icons.Rounded.AutoFixHigh,
                            "Opskalering · $upscaling",
                            onClick = { activeOption = V1PlayerOptionType.Upscaling },
                        )
                    }
                }
            }
        }

        activeOption?.let { option ->
            V1PlayerOptionOverlay(
                type = option,
                selectedValue = when (option) {
                    V1PlayerOptionType.Subtitles -> subtitle
                    V1PlayerOptionType.Audio -> audio
                    V1PlayerOptionType.Quality -> quality
                    V1PlayerOptionType.Upscaling -> upscaling
                },
                subtitleOffsetMs = subtitleOffsetMs,
                onSelected = { value ->
                    when (option) {
                        V1PlayerOptionType.Subtitles -> subtitle = value
                        V1PlayerOptionType.Audio -> audio = value
                        V1PlayerOptionType.Quality -> quality = value
                        V1PlayerOptionType.Upscaling -> upscaling = value
                    }
                },
                onAdjustSubtitleOffset = { delta -> subtitleOffsetMs = (subtitleOffsetMs + delta).coerceIn(-10000, 10000) },
                onDismiss = { activeOption = null },
            )
        }

        seekFeedback?.let { seconds ->
            V1Toast(
                if (seconds > 0) "+${seconds} sekunder" else "${-seconds} sekunder tilbage",
                modifier = Modifier.align(Alignment.Center),
                accent = if (seconds > 0) V1Colors.Cyan else V1Colors.Gold,
            )
        }
    }
}

@Composable
private fun PlayerTimeline(progress: Float) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(5.dp)
            .background(Color.White.copy(alpha = 0.16f), RoundedCornerShape(50.dp)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.71f)
                .fillMaxHeight()
                .background(V1Colors.Cyan.copy(alpha = 0.64f), RoundedCornerShape(50.dp)),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(progress.coerceIn(0f, 1f))
                .fillMaxHeight()
                .background(
                    Brush.horizontalGradient(listOf(V1Colors.GoldDeep, V1Colors.Gold)),
                    RoundedCornerShape(50.dp),
                ),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(progress.coerceIn(0f, 1f))
                .fillMaxHeight(),
            contentAlignment = Alignment.CenterEnd,
        ) {
            Box(
                Modifier
                    .size(11.dp)
                    .background(V1Colors.Gold, CircleShape)
                    .border(2.dp, Color.White, CircleShape),
            )
        }
    }
}

@Composable
private fun PlayerControl(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    onClick: () -> Unit,
) {
    V1FocusSurface(
        onClick = onClick,
        modifier = modifier,
        radius = 50.dp,
        background = if (primary) {
            Brush.horizontalGradient(listOf(V1Colors.Gold, Color(0xFFFFE17B)))
        } else {
            Brush.horizontalGradient(listOf(Color(0xD92A333C), Color(0xD91B2229)))
        },
        focusedBackground = Brush.horizontalGradient(listOf(Color.White, V1Colors.Gold)),
    ) { focused ->
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                icon,
                contentDescription = label,
                tint = if (primary || focused) V1Colors.Background else V1Colors.Text,
                modifier = Modifier.size(14.dp),
            )
            Text(
                label,
                color = if (primary || focused) V1Colors.Background else V1Colors.Text,
                fontSize = 7.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

private fun formatPlayerTime(totalSeconds: Int): String {
    val safe = totalSeconds.coerceAtLeast(0)
    val minutes = safe / 60
    val seconds = safe % 60
    return "%d:%02d".format(minutes, seconds)
}
