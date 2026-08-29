package com.boltbytes.media.tv.v1

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object V1Colors {
    val background = Color(0xFF05070A)
    val surface = Color(0xE8151B22)
    val elevated = Color(0xFF222B35)
    val border = Color(0xFF36424E)
    val text = Color(0xFFF7F8FA)
    val muted = Color(0xFF9AA7B4)
    val mutedSoft = Color(0xFF687582)
    val gold = Color(0xFFF5C443)
    val goldDeep = Color(0xFFC58B25)
    val cyan = Color(0xFF6CD2EA)
    val green = Color(0xFF72D6A2)
}

@Composable
fun BoltBytesTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = V1Colors.gold,
            secondary = V1Colors.cyan,
            background = V1Colors.background,
            surface = V1Colors.surface,
            onPrimary = V1Colors.background,
            onBackground = V1Colors.text,
            onSurface = V1Colors.text,
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
        modifier.background(
            Brush.radialGradient(
                colors = listOf(accent.copy(alpha = 0.38f), V1Colors.background),
                radius = 1500f,
            ),
        ),
    ) {
        Box(
            Modifier
                .matchParentSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, V1Colors.background.copy(alpha = 0.88f)),
                        startY = 240f,
                    ),
                ),
        )
        content()
    }
}

@Composable
fun V1FocusSurface(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    radius: Int = 15,
    scaleWhenFocused: Float = 1.045f,
    onFocused: () -> Unit = {},
    content: @Composable BoxScope.(Boolean) -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) scaleWhenFocused else 1f, label = "focus-scale")
    val elevation by animateDpAsState(if (focused) 24.dp else 0.dp, label = "focus-shadow")
    val borderColor by animateColorAsState(
        if (focused) V1Colors.gold else V1Colors.border,
        label = "focus-border",
    )
    Box(
        modifier
            .scale(scale)
            .shadow(elevation, RoundedCornerShape(radius.dp))
            .clip(RoundedCornerShape(radius.dp))
            .background(
                if (focused) V1Colors.elevated else V1Colors.surface,
                RoundedCornerShape(radius.dp),
            )
            .border(if (focused) 3.dp else 1.dp, borderColor, RoundedCornerShape(radius.dp))
            .onFocusChanged {
                val becameFocused = it.isFocused && !focused
                focused = it.isFocused
                if (becameFocused) onFocused()
            }
            .onKeyEvent { event ->
                val confirm = event.key == Key.Enter ||
                    event.key == Key.DirectionCenter ||
                    event.key == Key.NumPadEnter
                if (confirm && event.type == KeyEventType.KeyUp) {
                    onClick()
                    true
                } else {
                    confirm
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
    secondary: Boolean = false,
) {
    V1FocusSurface(
        onClick = onClick,
        modifier = modifier,
        radius = 13,
        scaleWhenFocused = 1.025f,
    ) { focused ->
        Box(
            Modifier
                .background(
                    when {
                        focused -> V1Colors.gold
                        secondary -> V1Colors.elevated
                        else -> Color(0xFFF3F4F6)
                    },
                    RoundedCornerShape(12.dp),
                )
                .padding(horizontal = 22.dp, vertical = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = label,
                color = if (focused || !secondary) V1Colors.background else V1Colors.text,
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }
    }
}

@Composable
fun V1Pill(label: String, emphasized: Boolean = false) {
    Row(
        Modifier
            .background(
                if (emphasized) V1Colors.gold.copy(alpha = 0.16f) else Color(0x88151B22),
                CircleShape,
            )
            .border(
                1.dp,
                if (emphasized) V1Colors.gold.copy(alpha = 0.55f) else V1Colors.border.copy(alpha = 0.75f),
                CircleShape,
            )
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (emphasized) Box(Modifier.background(V1Colors.gold, CircleShape).padding(3.dp))
        Text(
            label,
            color = if (emphasized) V1Colors.gold else V1Colors.text,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
fun V1GlassPanel(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.verticalGradient(listOf(Color(0xE8232B34), Color(0xE812171D))))
            .border(1.dp, Color.White.copy(alpha = 0.11f), RoundedCornerShape(24.dp)),
        content = content,
    )
}

@Composable
fun V1Glow(color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier
            .blur(90.dp)
            .background(color.copy(alpha = 0.34f), CircleShape),
    )
}

