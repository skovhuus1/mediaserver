package com.boltbytes.media.tv.v1.ui

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.BookmarkAdd
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material.icons.rounded.Tv
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class ContextAction(
    val label: String,
    val description: String,
    val icon: ImageVector,
    val primary: Boolean = false,
    val action: () -> Unit,
)

@Composable
fun V1ContextMenuOverlay(
    title: String,
    subtitle: String,
    colors: List<Color>,
    onContinue: () -> Unit,
    onRestart: () -> Unit = onContinue,
    onOpenTitle: () -> Unit,
    inWatchlist: Boolean = false,
    watched: Boolean = false,
    onToggleWatchlist: () -> Unit = {},
    onToggleWatched: () -> Unit = {},
    onDismiss: () -> Unit,
) {
    val firstAction = remember { FocusRequester() }
    val actions = listOf(
        ContextAction("Fortsæt", "Afspil fra din gemte position", Icons.Rounded.PlayArrow, true, onContinue),
        ContextAction("Start forfra", "Nulstil kun denne afspilning", Icons.Rounded.RestartAlt, action = onRestart),
        ContextAction("Gå til serie", "Åbn sæsoner og alle afsnit", Icons.Rounded.Tv, action = onOpenTitle),
        ContextAction(
            if (inWatchlist) "Fjern fra Min liste" else "Føj til Min liste",
            if (inWatchlist) "Fjern titlen fra din profil" else "Gem titlen på din profil",
            Icons.Rounded.BookmarkAdd,
            action = { onToggleWatchlist(); onDismiss() },
        ),
        ContextAction(
            if (watched) "Markér som uset" else "Markér som set",
            "Opdatér historik og Fortsæt med at se",
            Icons.Rounded.CheckCircle,
            action = { onToggleWatched(); onDismiss() },
        ),
        ContextAction("Flere oplysninger", "Metadata, medvirkende og lignende", Icons.Rounded.Info, action = onOpenTitle),
    )

    LaunchedEffect(Unit) {
        firstAction.requestFocus()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.horizontalGradient(
                    listOf(Color.Black.copy(alpha = 0.24f), Color.Black.copy(alpha = 0.68f), Color.Black.copy(alpha = 0.9f)),
                ),
            ),
    ) {
        V1GlassPanel(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 24.dp)
                .width(348.dp)
                .fillMaxHeight(0.9f),
            radius = 22.dp,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(19.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    V1Artwork(
                        title = title,
                        colors = colors,
                        modifier = Modifier
                            .width(72.dp)
                            .height(98.dp),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        V1Pill("HURTIGMENU", color = V1Colors.Gold, emphasized = true)
                        Spacer(Modifier.height(8.dp))
                        Text(title, color = V1Colors.Text, fontSize = 17.sp, fontWeight = FontWeight.Black)
                        Spacer(Modifier.height(4.dp))
                        Text(subtitle, color = V1Colors.Muted, fontSize = 8.sp)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Hold OK nede på en titel for at åbne menuen.",
                            color = V1Colors.MutedSoft,
                            fontSize = 7.sp,
                            lineHeight = 10.sp,
                        )
                    }
                }
                Spacer(Modifier.height(15.dp))

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    actions.forEachIndexed { index, item ->
                        V1FocusSurface(
                            onClick = item.action,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(44.dp)
                                .then(if (index == 0) Modifier.focusRequester(firstAction) else Modifier),
                            radius = 12.dp,
                            focusedScale = 1.012f,
                            background = if (item.primary) {
                                Brush.horizontalGradient(listOf(V1Colors.Gold.copy(alpha = 0.22f), Color(0xFF241F13)))
                            } else {
                                Brush.horizontalGradient(listOf(Color(0xEC1B2229), Color(0xEC12171C)))
                            },
                        ) { focused ->
                            Row(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 11.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(29.dp)
                                        .background(
                                            if (focused) V1Colors.Gold else V1Colors.Elevated,
                                            RoundedCornerShape(9.dp),
                                        ),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        item.icon,
                                        contentDescription = null,
                                        tint = if (focused) V1Colors.Background else V1Colors.Text,
                                        modifier = Modifier.size(15.dp),
                                    )
                                }
                                Column {
                                    Text(
                                        item.label,
                                        color = if (focused) V1Colors.Gold else V1Colors.Text,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(item.description, color = V1Colors.MutedSoft, fontSize = 7.sp)
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
                        .padding(horizontal = 11.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("TILBAGE", color = V1Colors.MutedSoft, fontSize = 7.sp, fontWeight = FontWeight.Bold)
                    Text("Luk menu", color = V1Colors.Muted, fontSize = 7.sp)
                }
            }
        }
    }
}
