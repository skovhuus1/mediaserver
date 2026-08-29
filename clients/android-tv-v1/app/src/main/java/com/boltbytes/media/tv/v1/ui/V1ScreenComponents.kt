package com.boltbytes.media.tv.v1.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun V1ScreenHeader(
    section: String,
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            .padding(horizontal = 25.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(11.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                V1FocusSurface(
                    onClick = onBack,
                    modifier = Modifier.size(36.dp),
                    radius = 11.dp,
                ) { focused ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Rounded.ArrowBack,
                            contentDescription = "Tilbage",
                            tint = if (focused) V1Colors.Gold else V1Colors.Text,
                            modifier = Modifier.size(17.dp),
                        )
                    }
                }
            }
            Box(
                modifier = Modifier
                    .size(31.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(V1Colors.Gold),
                contentAlignment = Alignment.Center,
            ) {
                Text("B", color = V1Colors.Background, fontSize = 16.sp, fontWeight = FontWeight.Black)
            }
            Column {
                Text(
                    text = title,
                    color = V1Colors.Text,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.25.sp,
                )
                Text(
                    text = section,
                    color = V1Colors.Gold,
                    fontSize = 7.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.7.sp,
                )
            }
        }
        trailing?.invoke()
    }
}

@Composable
fun V1SectionTitle(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    action: String? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(if (subtitle == null) 16.dp else 22.dp)
                    .background(V1Colors.Gold, RoundedCornerShape(50.dp)),
            )
            Column {
                Text(title, color = V1Colors.Text, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                if (subtitle != null) {
                    Text(subtitle, color = V1Colors.MutedSoft, fontSize = 8.sp)
                }
            }
        }
        if (action != null) {
            Text(
                text = action,
                color = V1Colors.Gold,
                fontSize = 8.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.8.sp,
            )
        }
    }
}

@Composable
fun V1Artwork(
    title: String,
    colors: List<Color>,
    modifier: Modifier = Modifier,
    badge: String? = null,
    progress: Float? = null,
    focused: Boolean = false,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Brush.linearGradient(colors)),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawCircle(
                color = Color.White.copy(alpha = if (focused) 0.14f else 0.08f),
                radius = size.minDimension * 0.72f,
                center = Offset(size.width * 0.78f, size.height * 0.28f),
            )
            repeat(7) { index ->
                drawRoundRect(
                    color = colors[index % colors.size].copy(alpha = 0.2f + index * 0.045f),
                    topLeft = Offset(size.width * (0.27f + index * 0.065f), size.height * (0.12f + index * 0.045f)),
                    size = Size(size.width * 0.32f, size.height * 0.78f),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(24f, 24f),
                )
            }
        }
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .fillMaxHeight(0.5f)
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.82f)))),
        )
        Text(
            text = title.take(1).uppercase(),
            color = Color.White.copy(alpha = 0.8f),
            fontSize = 44.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier.align(Alignment.Center),
        )
        badge?.let {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(7.dp)
                    .background(V1Colors.Gold, RoundedCornerShape(50.dp))
                    .padding(horizontal = 7.dp, vertical = 4.dp),
            ) {
                Text(it, color = V1Colors.Background, fontSize = 7.sp, fontWeight = FontWeight.Black)
            }
        }
        progress?.let {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(4.dp)
                    .background(Color.White.copy(alpha = 0.22f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(it.coerceIn(0f, 1f))
                        .fillMaxHeight()
                        .background(Brush.horizontalGradient(listOf(V1Colors.GoldDeep, V1Colors.Gold))),
                )
            }
        }
    }
}

@Composable
fun V1MediaCaption(
    title: String,
    metadata: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = title,
            color = V1Colors.Text,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = metadata,
            color = V1Colors.MutedSoft,
            fontSize = 7.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun V1StatusDot(label: String, color: Color, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(50.dp))
            .border(1.dp, color.copy(alpha = 0.38f), RoundedCornerShape(50.dp))
            .padding(horizontal = 9.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(5.dp).background(color, CircleShape))
        Text(label, color = color, fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
    }
}

@Composable
fun V1RemoteHints(
    vararg hints: Pair<String, String>,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .background(Color.Black.copy(alpha = 0.36f), RoundedCornerShape(50.dp))
            .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(50.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        hints.forEach { (key, action) ->
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .background(V1Colors.Elevated, RoundedCornerShape(6.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(6.dp))
                        .padding(horizontal = 6.dp, vertical = 3.dp),
                ) {
                    Text(key, color = V1Colors.Gold, fontSize = 6.sp, fontWeight = FontWeight.Black)
                }
                Text(action, color = V1Colors.Muted, fontSize = 7.sp)
            }
        }
    }
}

@Composable
fun V1Toast(
    message: String,
    modifier: Modifier = Modifier,
    accent: Color = V1Colors.Green,
) {
    Row(
        modifier = modifier
            .background(Color(0xF21A2229), RoundedCornerShape(50.dp))
            .border(1.dp, accent.copy(alpha = 0.48f), RoundedCornerShape(50.dp))
            .padding(horizontal = 14.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).background(accent, CircleShape))
        Text(message, color = V1Colors.Text, fontSize = 8.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun V1StatePanel(
    title: String,
    message: String,
    icon: ImageVector,
    actionLabel: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = V1Colors.Gold,
) {
    V1GlassPanel(
        modifier = modifier
            .width(340.dp)
            .height(190.dp),
        radius = 22.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(45.dp)
                    .background(accent.copy(alpha = 0.16f), RoundedCornerShape(14.dp))
                    .border(1.dp, accent.copy(alpha = 0.38f), RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.height(12.dp))
            Text(title, color = V1Colors.Text, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(5.dp))
            Text(
                message,
                color = V1Colors.Muted,
                fontSize = 8.sp,
                lineHeight = 12.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(13.dp))
            V1Button(actionLabel, onClick = onAction, primary = true)
        }
    }
}
