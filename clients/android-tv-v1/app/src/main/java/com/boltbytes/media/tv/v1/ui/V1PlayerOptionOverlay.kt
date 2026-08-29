package com.boltbytes.media.tv.v1.ui

import android.view.KeyEvent as AndroidKeyEvent
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Hd
import androidx.compose.material.icons.rounded.Subtitles
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class V1PlayerOptionType(
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
) {
    Subtitles("Undertekster", "Sprog, spor og timing", Icons.Rounded.Subtitles),
    Audio("Lydspor", "Sprog og lydformat", Icons.Rounded.GraphicEq),
    Quality("Kvalitet", "Automatisk eller fast rendition", Icons.Rounded.Hd),
    Upscaling("Opskalering", "Enhed, server eller fra", Icons.Rounded.AutoFixHigh),
}

private data class PlayerOptionChoice(
    val title: String,
    val metadata: String,
    val badge: String? = null,
)

@Composable
fun V1PlayerOptionOverlay(
    type: V1PlayerOptionType,
    selectedValue: String,
    subtitleOffsetMs: Int = 0,
    onSelected: (String) -> Unit,
    onAdjustSubtitleOffset: (Int) -> Unit = {},
    onDismiss: () -> Unit,
) {
    val choices = when (type) {
        V1PlayerOptionType.Subtitles -> listOf(
            PlayerOptionChoice("Fra", "Vis ingen undertekster"),
            PlayerOptionChoice("Dansk", "Tekstspor · SRT", "VALGT"),
            PlayerOptionChoice("English", "Tekstspor · WebVTT"),
            PlayerOptionChoice("Dansk · indbrændt", "Server-renderet"),
            PlayerOptionChoice("Undertekstforskydning", "venstre/højre"),
        )
        V1PlayerOptionType.Audio -> listOf(
            PlayerOptionChoice("Dansk", "Dolby Digital Plus · 5.1", "VALGT"),
            PlayerOptionChoice("Original", "Dolby Atmos · 7.1"),
            PlayerOptionChoice("English", "AAC · Stereo"),
            PlayerOptionChoice("Lydforbedring", "Dialog clarity · Fra"),
        )
        V1PlayerOptionType.Quality -> listOf(
            PlayerOptionChoice("Auto", "Anbefalet · op til 4K", "VALGT"),
            PlayerOptionChoice("Original", "Kildens originale bitrate"),
            PlayerOptionChoice("4K", "2160p · ca. 25 Mbit/s"),
            PlayerOptionChoice("Full HD", "1080p · ca. 8 Mbit/s"),
            PlayerOptionChoice("HD", "720p · ca. 4 Mbit/s"),
        )
        V1PlayerOptionType.Upscaling -> listOf(
            PlayerOptionChoice("Automatisk", "Matcher kilde, netværk og TV", "ANBEFALET"),
            PlayerOptionChoice("TV", "Brug enhedens billedprocessor", "VALGT"),
            PlayerOptionChoice("Server", "Forbehandl billedet med FFmpeg"),
            PlayerOptionChoice("Fra", "Afspil i kildens opløsning"),
        )
    }
    var selectedIndex by remember(type, selectedValue) {
        mutableIntStateOf(
            choices.indexOfFirst { it.title.equals(selectedValue, ignoreCase = true) }
                .takeIf { it >= 0 }
                ?: choices.indexOfFirst { it.badge == "VALGT" }.coerceAtLeast(0),
        )
    }
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(type) {
        firstFocus.requestFocus()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.horizontalGradient(
                    listOf(Color.Transparent, Color.Black.copy(alpha = 0.62f), Color.Black.copy(alpha = 0.92f)),
                ),
            ),
    ) {
        V1GlassPanel(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 18.dp)
                .width(356.dp)
                .fillMaxHeight(0.93f),
            radius = 22.dp,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(21.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .background(V1Colors.Gold.copy(alpha = 0.16f), RoundedCornerShape(13.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(type.icon, contentDescription = null, tint = V1Colors.Gold, modifier = Modifier.size(22.dp))
                    }
                    Column {
                        Text(type.title, color = V1Colors.Text, fontSize = 18.sp, fontWeight = FontWeight.Black)
                        Text(type.subtitle, color = V1Colors.Muted, fontSize = 8.sp)
                    }
                }
                Spacer(Modifier.height(17.dp))

                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    choices.forEachIndexed { index, choice ->
                        V1FocusSurface(
                            onClick = {
                                if (choice.title != "Undertekstforskydning") {
                                    selectedIndex = index
                                    onSelected(choice.title)
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp)
                                .onPreviewKeyEvent { event ->
                                    if (choice.title != "Undertekstforskydning" || event.type != KeyEventType.KeyDown) {
                                        false
                                    } else {
                                        when (event.nativeKeyEvent.keyCode) {
                                            AndroidKeyEvent.KEYCODE_DPAD_LEFT -> {
                                                onAdjustSubtitleOffset(-100)
                                                true
                                            }
                                            AndroidKeyEvent.KEYCODE_DPAD_RIGHT -> {
                                                onAdjustSubtitleOffset(100)
                                                true
                                            }
                                            else -> false
                                        }
                                    }
                                }
                                .then(if (index == selectedIndex) Modifier.focusRequester(firstFocus) else Modifier),
                            radius = 13.dp,
                            focusedScale = 1.012f,
                            background = Brush.horizontalGradient(
                                listOf(
                                    if (index == selectedIndex) V1Colors.Gold.copy(alpha = 0.16f) else Color(0xEC1A2128),
                                    Color(0xEC11161B),
                                ),
                            ),
                        ) { focused ->
                            Row(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column {
                                    Text(
                                        choice.title,
                                        color = if (focused) V1Colors.Gold else V1Colors.Text,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Spacer(Modifier.height(3.dp))
                                    Text(
                                        if (choice.title == "Undertekstforskydning") {
                                            "%+.1f sek. · venstre/højre".format(subtitleOffsetMs / 1000f)
                                        } else {
                                            choice.metadata
                                        },
                                        color = V1Colors.MutedSoft,
                                        fontSize = 7.sp,
                                    )
                                }
                                if (index == selectedIndex) {
                                    Box(
                                        modifier = Modifier
                                            .size(23.dp)
                                            .background(V1Colors.Gold, CircleShape),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(
                                            Icons.Rounded.Check,
                                            contentDescription = null,
                                            tint = V1Colors.Background,
                                            modifier = Modifier.size(13.dp),
                                        )
                                    }
                                } else if (choice.badge != null) {
                                    V1Pill(choice.badge, color = V1Colors.Cyan, emphasized = true)
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.weight(1f))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(V1Colors.Background.copy(alpha = 0.48f), RoundedCornerShape(11.dp))
                        .padding(horizontal = 11.dp, vertical = 9.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("TILBAGE", color = V1Colors.MutedSoft, fontSize = 7.sp, fontWeight = FontWeight.Bold)
                    Text("Luk ${type.title.lowercase()} · ${selectedValue}", color = V1Colors.Muted, fontSize = 7.sp)
                }
            }
        }
    }
}
