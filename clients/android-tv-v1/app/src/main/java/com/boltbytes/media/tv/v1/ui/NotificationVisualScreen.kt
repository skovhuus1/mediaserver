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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DownloadDone
import androidx.compose.material.icons.rounded.NewReleases
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class PreviewNotification(
    val title: String,
    val summary: String,
    val detail: String,
    val time: String,
    val icon: ImageVector,
    val color: Color,
    val unread: Boolean,
)

@Composable
fun NotificationVisualScreen(
    onBack: () -> Unit,
    onOpenTitle: () -> Unit,
) {
    val notifications = listOf(
        PreviewNotification(
            "7 nye afsnit af DNA",
            "Hele den nye sæson er nu i dit bibliotek.",
            "DNA er blevet opdateret med syv nye afsnit. Åbn serien for at se sæsonen og fortsætte direkte fra det næste usete afsnit.",
            "2 min.",
            Icons.Rounded.NewReleases,
            V1Colors.Gold,
            true,
        ),
        PreviewNotification(
            "Download færdig",
            "The Sinner · S2 A4 er klar offline.",
            "Afsnittet er downloadet i 1080p med dansk lyd og undertekster. Licensen er gyldig i 29 dage.",
            "18 min.",
            Icons.Rounded.DownloadDone,
            V1Colors.Green,
            true,
        ),
        PreviewNotification(
            "Ny TV-version tilgængelig",
            "Version 1.0.1 kan installeres.",
            "Opdateringen forbedrer afspilningsstabilitet, navigation og Live TV-guiden. Installationen kræver en genstart af appen.",
            "I går",
            Icons.Rounded.SystemUpdate,
            V1Colors.Cyan,
            false,
        ),
        PreviewNotification(
            "Fortsæt med at se",
            "Du har 31 minutter tilbage af The Sinner.",
            "Din position er synkroniseret. Du kan fortsætte på TV, mobil eller en anden godkendt enhed.",
            "Mandag",
            Icons.Rounded.NotificationsActive,
            Color(0xFFB18ADB),
            false,
        ),
    )
    var selectedIndex by remember { mutableIntStateOf(0) }
    var unreadIndices by remember { mutableStateOf(setOf(0, 1)) }
    var message by remember { mutableStateOf<String?>(null) }
    val selected = notifications[selectedIndex]

    V1AmbientBackground(accent = selected.color.copy(alpha = 0.7f)) {
        Column(modifier = Modifier.fillMaxSize()) {
            V1ScreenHeader(
                section = "INDBAKKE",
                title = "NOTIFIKATIONER",
                onBack = onBack,
                trailing = { V1StatusDot("${unreadIndices.size} ULÆSTE", if (unreadIndices.isEmpty()) V1Colors.Green else V1Colors.Gold) },
            )

            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(start = 25.dp, end = 25.dp, bottom = 22.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Column(
                    modifier = Modifier
                        .width(348.dp)
                        .fillMaxHeight(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        V1SectionTitle("Seneste", subtitle = "Din aktivitet på tværs af enheder")
                        V1Button(
                            "Markér alle læst",
                            onClick = {
                                unreadIndices = emptySet()
                                message = "Alle notifikationer er markeret som læst"
                            },
                            icon = Icons.Rounded.Check,
                        )
                    }
                    notifications.forEachIndexed { index, item ->
                        V1FocusSurface(
                            onClick = { selectedIndex = index },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(74.dp),
                            radius = 14.dp,
                            focusedScale = 1.012f,
                            onFocused = { selectedIndex = index },
                            background = Brush.horizontalGradient(
                                listOf(
                                    if (index in unreadIndices) item.color.copy(alpha = 0.14f) else V1Colors.SurfaceSolid,
                                    Color(0xE811161C),
                                ),
                            ),
                        ) { focused ->
                            Row(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(11.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(39.dp)
                                        .background(item.color.copy(alpha = 0.17f), RoundedCornerShape(12.dp)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(item.icon, contentDescription = null, tint = item.color, modifier = Modifier.size(19.dp))
                                    if (index in unreadIndices) {
                                        Box(
                                            Modifier
                                                .align(Alignment.TopEnd)
                                                .size(7.dp)
                                                .background(V1Colors.Gold, CircleShape),
                                        )
                                    }
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        item.title,
                                        color = if (focused) V1Colors.Gold else V1Colors.Text,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Spacer(Modifier.height(3.dp))
                                    Text(
                                        item.summary,
                                        color = V1Colors.Muted,
                                        fontSize = 8.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                Text(item.time, color = V1Colors.MutedSoft, fontSize = 7.sp)
                            }
                        }
                    }
                }

                V1GlassPanel(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .padding(top = 8.dp),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(28.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(58.dp)
                                    .background(selected.color.copy(alpha = 0.16f), RoundedCornerShape(17.dp)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(selected.icon, contentDescription = null, tint = selected.color, modifier = Modifier.size(28.dp))
                            }
                            V1Pill(
                                if (selectedIndex in unreadIndices) "ULÆST" else "LÆST",
                                color = if (selectedIndex in unreadIndices) V1Colors.Gold else V1Colors.Green,
                                emphasized = true,
                            )
                        }
                        Spacer(Modifier.height(24.dp))
                        Text(selected.title, color = V1Colors.Text, fontSize = 24.sp, fontWeight = FontWeight.Black)
                        Spacer(Modifier.height(8.dp))
                        Text(selected.summary, color = selected.color, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(14.dp))
                        Text(
                            selected.detail,
                            color = V1Colors.Muted,
                            fontSize = 10.sp,
                            lineHeight = 15.sp,
                        )
                        Spacer(Modifier.weight(1f))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            V1Button("Åbn", onClick = onOpenTitle, primary = true, icon = Icons.Rounded.PlayArrow)
                            V1Button(
                                if (selectedIndex in unreadIndices) "Markér som læst" else "Allerede læst",
                                onClick = {
                                    unreadIndices = unreadIndices - selectedIndex
                                    message = "Notifikationen er markeret som læst"
                                },
                                icon = Icons.Rounded.Check,
                            )
                        }
                    }
                }
            }
        }
        message?.let {
            V1Toast(it, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 17.dp))
        }
    }
}
