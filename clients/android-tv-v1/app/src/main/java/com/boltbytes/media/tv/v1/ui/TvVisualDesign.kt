package com.boltbytes.media.tv.v1.ui

import android.os.SystemClock
import android.view.KeyEvent as AndroidKeyEvent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object V1Colors {
    val Background = Color(0xFF05070A)
    val BackgroundSoft = Color(0xFF0A0E13)
    val Surface = Color(0xE8151B22)
    val SurfaceSolid = Color(0xFF151B22)
    val Elevated = Color(0xFF222B35)
    val Border = Color(0xFF36424E)
    val Text = Color(0xFFF7F8FA)
    val Muted = Color(0xFF9AA7B4)
    val MutedSoft = Color(0xFF687582)
    val Gold = Color(0xFFF5C443)
    val GoldSoft = Color(0xFFFFE49A)
    val GoldDeep = Color(0xFFC58B25)
    val Cyan = Color(0xFF6CD2EA)
    val Blue = Color(0xFF6EA8FF)
    val Green = Color(0xFF72D6A2)
    val Danger = Color(0xFFFF796F)
}

@Composable
fun BoltBytesTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = V1Colors.Gold,
            onPrimary = V1Colors.Background,
            background = V1Colors.Background,
            onBackground = V1Colors.Text,
            surface = V1Colors.SurfaceSolid,
            onSurface = V1Colors.Text,
        ),
        content = content,
    )
}

@Composable
fun V1AmbientBackground(
    accent: Color,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    0f to Color(0xFF111820),
                    0.48f to V1Colors.BackgroundSoft,
                    1f to V1Colors.Background,
                ),
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(accent.copy(alpha = 0.25f), Color.Transparent),
                    radius = 1320f,
                    center = androidx.compose.ui.geometry.Offset(1450f, 120f),
                ),
            ),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            repeat(9) { index ->
                val y = size.height * (0.12f + index * 0.105f)
                drawLine(
                    color = Color.White.copy(alpha = 0.012f),
                    start = androidx.compose.ui.geometry.Offset(0f, y),
                    end = androidx.compose.ui.geometry.Offset(size.width, y - size.height * 0.08f),
                    strokeWidth = 1f,
                )
            }
            repeat(130) { index ->
                val x = ((index * 73) % 997) / 997f * size.width
                val y = ((index * 151) % 991) / 991f * size.height
                drawCircle(
                    color = Color.White.copy(alpha = if (index % 5 == 0) 0.024f else 0.012f),
                    radius = if (index % 7 == 0) 1.4f else 0.7f,
                    center = androidx.compose.ui.geometry.Offset(x, y),
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(Color.Transparent, V1Colors.Background.copy(alpha = 0.72f)),
                        radius = 1450f,
                    ),
                ),
        )
        content()
    }
}

@Composable
fun V1Glow(
    color: Color,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .blur(size / 3)
            .background(color.copy(alpha = 0.3f), CircleShape),
    )
}

@Composable
fun V1FocusSurface(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onLongClick: (() -> Unit)? = null,
    radius: Dp = 14.dp,
    focusedScale: Float = 1.025f,
    background: Brush = Brush.linearGradient(
        listOf(V1Colors.SurfaceSolid, V1Colors.Elevated.copy(alpha = 0.86f)),
    ),
    focusedBackground: Brush = Brush.linearGradient(
        listOf(Color(0xFF2D3031), Color(0xFF3A321F)),
    ),
    onFocused: () -> Unit = {},
    content: @Composable BoxScope.(Boolean) -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    var centerDownAt by remember { mutableLongStateOf(0L) }
    var longPressHandled by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (focused) focusedScale else 1f,
        animationSpec = tween(130),
        label = "focus-scale",
    )
    val elevation by animateFloatAsState(
        targetValue = if (focused) 14f else 2f,
        animationSpec = tween(130),
        label = "focus-shadow",
    )
    val shape = RoundedCornerShape(radius)

    Box(
        modifier = modifier
            .scale(scale)
            .shadow(elevation.dp, shape, clip = false)
            .clip(shape)
            .background(if (focused) focusedBackground else background)
            .then(
                if (focused) {
                    Modifier.background(
                        Brush.verticalGradient(
                            listOf(
                                Color.White.copy(alpha = 0.09f),
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.08f),
                            ),
                        ),
                    )
                } else {
                    Modifier
                },
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) V1Colors.Gold else V1Colors.Border.copy(alpha = 0.72f),
                shape = shape,
            )
            .onFocusChanged { state ->
                focused = state.isFocused
                if (state.isFocused) {
                    onFocused()
                } else {
                    centerDownAt = 0L
                    longPressHandled = false
                }
            }
            .onPreviewKeyEvent { event ->
                val isCenterKey = when (event.nativeKeyEvent.keyCode) {
                    AndroidKeyEvent.KEYCODE_DPAD_CENTER,
                    AndroidKeyEvent.KEYCODE_ENTER,
                    AndroidKeyEvent.KEYCODE_NUMPAD_ENTER,
                    AndroidKeyEvent.KEYCODE_BUTTON_A,
                    AndroidKeyEvent.KEYCODE_BUTTON_SELECT,
                    -> true
                    else -> false
                }
                if (!isCenterKey) return@onPreviewKeyEvent false

                when (event.type) {
                    KeyEventType.KeyDown -> {
                        if (centerDownAt == 0L) {
                            centerDownAt = SystemClock.elapsedRealtime()
                            longPressHandled = false
                            if (onLongClick == null) {
                                onClick()
                            }
                        } else if (
                            onLongClick != null &&
                            !longPressHandled &&
                            SystemClock.elapsedRealtime() - centerDownAt >= 550L
                        ) {
                            longPressHandled = true
                            onLongClick()
                        }
                        true
                    }
                    KeyEventType.KeyUp -> {
                        if (onLongClick != null && !longPressHandled) {
                            val heldFor = SystemClock.elapsedRealtime() - centerDownAt
                            if (heldFor >= 550L) {
                                onLongClick()
                            } else {
                                onClick()
                            }
                        }
                        centerDownAt = 0L
                        longPressHandled = false
                        true
                    }
                    else -> false
                }
            }
            .focusable(),
    ) {
        content(focused)
    }
}

@Composable
fun V1Button(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    icon: ImageVector? = null,
) {
    V1FocusSurface(
        onClick = onClick,
        modifier = modifier.height(40.dp),
        radius = 50.dp,
        background = if (primary) {
            Brush.horizontalGradient(listOf(V1Colors.Gold, Color(0xFFFFDF70)))
        } else {
            Brush.horizontalGradient(
                listOf(V1Colors.Surface.copy(alpha = 0.95f), V1Colors.Elevated.copy(alpha = 0.9f)),
            )
        },
        focusedBackground = if (primary) {
            Brush.horizontalGradient(listOf(Color(0xFFFFE98E), V1Colors.Gold))
        } else {
            Brush.horizontalGradient(listOf(Color(0xFF3A4046), Color(0xFF262C32)))
        },
    ) { focused ->
        Row(
            modifier = Modifier
                .fillMaxHeight()
                .padding(horizontal = 17.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon ?: Icons.Rounded.ArrowForward,
                contentDescription = null,
                tint = if (primary) V1Colors.Background else if (focused) V1Colors.Gold else V1Colors.Text,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = label,
                color = if (primary) V1Colors.Background else V1Colors.Text,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.1.sp,
            )
        }
    }
}

@Composable
fun V1Pill(
    label: String,
    modifier: Modifier = Modifier,
    color: Color = V1Colors.Muted,
    emphasized: Boolean = false,
    dot: Color? = null,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50.dp))
            .background(
                if (emphasized) color.copy(alpha = 0.16f) else V1Colors.Surface.copy(alpha = 0.64f),
            )
            .border(1.dp, color.copy(alpha = if (emphasized) 0.48f else 0.22f), RoundedCornerShape(50.dp))
            .padding(horizontal = 9.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dot != null) {
            Box(
                modifier = Modifier
                    .size(5.dp)
                    .background(dot, CircleShape),
            )
        }
        Text(
            text = label,
            color = if (emphasized) color else V1Colors.Muted,
            fontSize = 8.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.45.sp,
        )
    }
}

@Composable
fun V1GlassPanel(
    modifier: Modifier = Modifier,
    radius: Dp = 20.dp,
    content: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    Box(
        modifier = modifier
            .shadow(16.dp, shape, clip = false)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(Color(0xD9212932), Color(0xB913181E), Color(0xDF0D1116)),
                ),
            )
            .border(1.dp, Color.White.copy(alpha = 0.11f), shape),
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .height(1.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(Color.Transparent, Color.White.copy(alpha = 0.22f), Color.Transparent),
                    ),
                ),
        )
        content()
    }
}
