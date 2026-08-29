package com.boltbytes.media.tv.v1.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Category
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Tv
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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

private enum class PreviewShape { LANDSCAPE, POSTER }

private data class RailDestination(
    val icon: ImageVector,
    val label: String,
)

private data class PreviewTitle(
    val title: String,
    val subtitle: String,
    val eyebrow: String,
    val year: String,
    val progress: Float? = null,
    val badge: String? = null,
    val colors: List<Color>,
)

private data class PreviewRow(
    val title: String,
    val secondary: String,
    val shape: PreviewShape,
    val items: List<PreviewTitle>,
)

private val previewRows = listOf(
    PreviewRow(
        title = "Fortsæt med at se",
        secondary = "Fortsæt præcis hvor du slap",
        shape = PreviewShape.LANDSCAPE,
        items = listOf(
            PreviewTitle(
                title = "The Sinner",
                subtitle = "Sæson 2 · Afsnit 4",
                eyebrow = "38 MIN. TILBAGE",
                year = "2024",
                progress = 0.42f,
                colors = listOf(Color(0xFF123D4B), Color(0xFF6D2735), Color(0xFF101820)),
            ),
            PreviewTitle(
                title = "DNA",
                subtitle = "Sæson 2 · Afsnit 6",
                eyebrow = "21 MIN. TILBAGE",
                year = "2023",
                progress = 0.64f,
                colors = listOf(Color(0xFF3C4B52), Color(0xFF232B34), Color(0xFF0C1015)),
            ),
            PreviewTitle(
                title = "Sommer",
                subtitle = "Sæson 1 · Afsnit 9",
                eyebrow = "47 MIN. TILBAGE",
                year = "2008",
                progress = 0.27f,
                colors = listOf(Color(0xFF693A26), Color(0xFFB56A3C), Color(0xFF15100D)),
            ),
            PreviewTitle(
                title = "Reacher",
                subtitle = "Sæson 3 · Afsnit 2",
                eyebrow = "12 MIN. TILBAGE",
                year = "2025",
                progress = 0.81f,
                colors = listOf(Color(0xFF665020), Color(0xFF222D36), Color(0xFF0C1116)),
            ),
        ),
    ),
    PreviewRow(
        title = "Senest tilføjet",
        secondary = "Nyt i dit bibliotek",
        shape = PreviewShape.POSTER,
        items = listOf(
            PreviewTitle(
                title = "Helt Sort",
                subtitle = "Ny sæson",
                eyebrow = "SERIE",
                year = "2025",
                badge = "7",
                colors = listOf(Color(0xFF911D2E), Color(0xFFE05C2A), Color(0xFF20100D)),
            ),
            PreviewTitle(
                title = "The Veil",
                subtitle = "Miniserie",
                eyebrow = "SERIE",
                year = "2024",
                badge = "NY",
                colors = listOf(Color(0xFF112542), Color(0xFF286093), Color(0xFF080D17)),
            ),
            PreviewTitle(
                title = "Hill Song",
                subtitle = "Dokumentar",
                eyebrow = "FILM",
                year = "2024",
                colors = listOf(Color(0xFF71421B), Color(0xFFD99A2D), Color(0xFF21130B)),
            ),
            PreviewTitle(
                title = "The Mob",
                subtitle = "Krimi",
                eyebrow = "SERIE",
                year = "2023",
                colors = listOf(Color(0xFF26394E), Color(0xFF77859A), Color(0xFF0C1118)),
            ),
            PreviewTitle(
                title = "The Idol",
                subtitle = "Drama",
                eyebrow = "SERIE",
                year = "2023",
                badge = "1",
                colors = listOf(Color(0xFF4B151D), Color(0xFFB3354A), Color(0xFF16090B)),
            ),
        ),
    ),
)

private val premiumPreviewRows = listOf(
    PreviewRow(
        title = "Nye episoder",
        secondary = "Grupperet efter serie og udgivelsestidspunkt",
        shape = PreviewShape.LANDSCAPE,
        items = listOf(
            PreviewTitle("DNA", "7 nye afsnit", "NY SÆSON", "2025", badge = "7", colors = listOf(Color(0xFF45535A), Color(0xFF202A32), Color(0xFF0B1015))),
            PreviewTitle("Helt Sort", "3 nye afsnit", "NYE AFSNIT", "2025", badge = "3", colors = listOf(Color(0xFF8E1F30), Color(0xFFE05A2B), Color(0xFF20100D))),
            PreviewTitle("Reacher", "Sæson 3 · Afsnit 6", "NYT AFSNIT", "2025", badge = "1", colors = listOf(Color(0xFF665020), Color(0xFF222D36), Color(0xFF0C1116))),
            PreviewTitle("Sommer", "Sæson 2 · Afsnit 4", "NYT AFSNIT", "2009", badge = "1", colors = listOf(Color(0xFF693A26), Color(0xFFB56A3C), Color(0xFF15100D))),
        ),
    ),
    PreviewRow(
        title = "Anbefalet til Henrik",
        secondary = "Baseret på krimi, drama og det du har set færdigt",
        shape = PreviewShape.POSTER,
        items = listOf(
            PreviewTitle("Unit 9", "5 sæsoner", "98% MATCH", "2024", colors = listOf(Color(0xFF344551), Color(0xFF647985), Color(0xFF0D1317))),
            PreviewTitle("Harbour", "3 sæsoner", "96% MATCH", "2023", colors = listOf(Color(0xFF244755), Color(0xFF4B8594), Color(0xFF091317))),
            PreviewTitle("The Divide", "2 sæsoner", "94% MATCH", "2024", colors = listOf(Color(0xFF5A3540), Color(0xFFA7606D), Color(0xFF160C10))),
            PreviewTitle("Northern Lights", "1 sæson", "91% MATCH", "2025", colors = listOf(Color(0xFF174E49), Color(0xFF3D9A80), Color(0xFF081512))),
            PreviewTitle("After Dark", "Thriller", "89% MATCH", "2024", colors = listOf(Color(0xFF30234F), Color(0xFF6F4B91), Color(0xFF0E0A16))),
        ),
    ),
)

@Composable
fun HubVisualScreen(
    onLogout: (() -> Unit)? = null,
    onBackToLogin: (() -> Unit)? = null,
    onOpenTitle: () -> Unit = {},
    onOpenPlayer: () -> Unit = {},
    onOpenMovies: () -> Unit = {},
    onOpenSeries: () -> Unit = {},
    onOpenLiveTv: () -> Unit = {},
    onOpenGenres: () -> Unit = {},
    onOpenDownloads: () -> Unit = {},
    onOpenSearch: () -> Unit = {},
    onOpenProfile: () -> Unit = {},
    onOpenNotifications: () -> Unit = {},
    onOpenSettings: () -> Unit = {},
) {
    val leave = onLogout ?: onBackToLogin ?: {}
    val allRows = previewRows + premiumPreviewRows
    var selectedTitle by remember { mutableStateOf(allRows.first().items.first()) }
    var contextItem by remember { mutableStateOf<PreviewTitle?>(null) }
    var watchlist by remember { mutableStateOf(setOf<String>()) }
    var watched by remember { mutableStateOf(setOf<String>()) }
    var message by remember { mutableStateOf<String?>(null) }

    BackHandler(enabled = contextItem != null) {
        contextItem = null
    }

    V1AmbientBackground(accent = selectedTitle.colors.first()) {
        V1Glow(
            color = selectedTitle.colors.getOrElse(1) { V1Colors.Cyan },
            size = 360.dp,
            modifier = Modifier.align(Alignment.TopEnd),
        )

        Row(modifier = Modifier.fillMaxSize()) {
            HubRail(
                onLogout = leave,
                onOpenMovies = onOpenMovies,
                onOpenSeries = onOpenSeries,
                onOpenLiveTv = onOpenLiveTv,
                onOpenGenres = onOpenGenres,
                onOpenDownloads = onOpenDownloads,
                onOpenSearch = onOpenSearch,
                onOpenProfile = onOpenProfile,
                onOpenNotifications = onOpenNotifications,
                onOpenSettings = onOpenSettings,
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            ) {
                HubTopBar()
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    item {
                        HeroFeature(
                            item = selectedTitle,
                            onPlay = onOpenPlayer,
                            onInfo = onOpenTitle,
                            inWatchlist = selectedTitle.title in watchlist,
                            onToggleWatchlist = {
                                watchlist = if (selectedTitle.title in watchlist) watchlist - selectedTitle.title else watchlist + selectedTitle.title
                                message = if (selectedTitle.title in watchlist) "Føjet til Min liste" else "Fjernet fra Min liste"
                            },
                            modifier = Modifier.padding(start = 24.dp, end = 30.dp, top = 4.dp),
                        )
                    }
                    allRows.forEach { row ->
                        item(key = row.title) {
                            PreviewMediaRow(
                                row = row,
                                onFocused = { selectedTitle = it },
                                onOpenTitle = onOpenTitle,
                                onLongPress = { contextItem = it },
                            )
                        }
                    }
                    item { Spacer(Modifier.height(20.dp)) }
                }
            }
        }

        contextItem?.let { item ->
            V1ContextMenuOverlay(
                title = item.title,
                subtitle = item.subtitle,
                colors = item.colors,
                onContinue = {
                    contextItem = null
                    onOpenPlayer()
                },
                onRestart = {
                    contextItem = null
                    message = "Starter ${item.title} forfra"
                    onOpenPlayer()
                },
                onOpenTitle = {
                    contextItem = null
                    onOpenTitle()
                },
                inWatchlist = item.title in watchlist,
                watched = item.title in watched,
                onToggleWatchlist = {
                    watchlist = if (item.title in watchlist) watchlist - item.title else watchlist + item.title
                    message = if (item.title in watchlist) "Føjet til Min liste" else "Fjernet fra Min liste"
                },
                onToggleWatched = {
                    watched = if (item.title in watched) watched - item.title else watched + item.title
                    message = if (item.title in watched) "Markeret som set" else "Markeret som uset"
                },
                onDismiss = { contextItem = null },
            )
        }
        message?.let {
            V1Toast(it, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp))
        }
    }
}

@Composable
private fun HubRail(
    onLogout: () -> Unit,
    onOpenMovies: () -> Unit,
    onOpenSeries: () -> Unit,
    onOpenLiveTv: () -> Unit,
    onOpenGenres: () -> Unit,
    onOpenDownloads: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val destinations = listOf(
        RailDestination(Icons.Rounded.Home, "Hjem"),
        RailDestination(Icons.Rounded.Movie, "Film"),
        RailDestination(Icons.Rounded.Tv, "Serier"),
        RailDestination(Icons.Rounded.LiveTv, "Live TV"),
        RailDestination(Icons.Rounded.Search, "Søg"),
        RailDestination(Icons.Rounded.Category, "Genre"),
    )

    Column(
        modifier = Modifier
            .width(72.dp)
            .fillMaxHeight()
            .background(
                Brush.horizontalGradient(
                    listOf(Color(0xF207090C), Color(0xE90A0D11), Color.Transparent),
                ),
            )
            .border(width = 1.dp, color = Color.White.copy(alpha = 0.05f))
            .padding(vertical = 17.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(V1Colors.Gold),
            contentAlignment = Alignment.Center,
        ) {
            Text("B", color = V1Colors.Background, fontSize = 17.sp, fontWeight = FontWeight.Black)
        }
        Spacer(Modifier.height(14.dp))

        destinations.forEachIndexed { index, destination ->
            RailButton(
                destination = destination,
                selected = index == 0,
                onClick = when (index) {
                    1 -> onOpenMovies
                    2 -> onOpenSeries
                    3 -> onOpenLiveTv
                    4 -> onOpenSearch
                    5 -> onOpenGenres
                    else -> ({})
                },
            )
            Spacer(Modifier.height(4.dp))
        }

        Spacer(Modifier.weight(1f))
        RailButton(
            destination = RailDestination(Icons.Rounded.Download, "Downloads"),
            selected = false,
            onClick = onOpenDownloads,
        )
        Spacer(Modifier.height(4.dp))
        RailButton(
            destination = RailDestination(Icons.Rounded.Notifications, "Notifikationer"),
            selected = false,
            onClick = onOpenNotifications,
            badge = true,
        )
        Spacer(Modifier.height(4.dp))
        RailButton(
            destination = RailDestination(Icons.Rounded.Person, "Profil"),
            selected = false,
            onClick = onOpenProfile,
        )
        Spacer(Modifier.height(4.dp))
        RailButton(
            destination = RailDestination(Icons.Rounded.Settings, "Indstillinger"),
            selected = false,
            onClick = onOpenSettings,
        )
        Spacer(Modifier.height(4.dp))
        RailButton(
            destination = RailDestination(Icons.Rounded.Logout, "Log ud"),
            selected = false,
            onClick = onLogout,
        )
    }
}

@Composable
private fun RailButton(
    destination: RailDestination,
    selected: Boolean,
    onClick: () -> Unit,
    badge: Boolean = false,
) {
    V1FocusSurface(
        onClick = onClick,
        modifier = Modifier.size(36.dp),
        radius = 12.dp,
        focusedScale = 1.06f,
        background = Brush.linearGradient(
            listOf(
                if (selected) V1Colors.Gold.copy(alpha = 0.18f) else Color.Transparent,
                Color.Transparent,
            ),
        ),
        focusedBackground = Brush.linearGradient(listOf(V1Colors.Gold, Color(0xFFFFE384))),
    ) { focused ->
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Icon(
                imageVector = destination.icon,
                contentDescription = destination.label,
                tint = when {
                    focused -> V1Colors.Background
                    selected -> V1Colors.Gold
                    else -> V1Colors.Muted
                },
                modifier = Modifier.size(18.dp),
            )
            if (badge) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .size(5.dp)
                        .background(V1Colors.Gold, CircleShape),
                )
            }
        }
    }
}

@Composable
private fun HubTopBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp)
            .padding(start = 25.dp, end = 30.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "BOLTBYTES",
                    color = V1Colors.Text,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.7.sp,
                )
                Text(
                    text = "HJEM",
                    color = V1Colors.Gold,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 2.sp,
                )
            }
            Box(
                modifier = Modifier
                    .height(20.dp)
                    .width(1.dp)
                    .background(Color.White.copy(alpha = 0.12f)),
            )
            V1Pill("ONLINE", color = V1Colors.Green, emphasized = true, dot = V1Colors.Green)
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(11.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            V1RemoteHints("OK" to "Åbn", "HOLD OK" to "Hurtigmenu")
            Icon(Icons.Rounded.Wifi, contentDescription = null, tint = V1Colors.Green, modifier = Modifier.size(14.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text("20:42", color = V1Colors.Text, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text("FREDAG 29. AUG", color = V1Colors.MutedSoft, fontSize = 8.sp, letterSpacing = 1.1.sp)
            }
            Box(
                modifier = Modifier
                    .size(31.dp)
                    .background(
                        Brush.linearGradient(listOf(Color(0xFF33414F), Color(0xFF1B222B))),
                        CircleShape,
                    )
                    .border(1.dp, Color.White.copy(alpha = 0.17f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("H", color = V1Colors.Text, fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun HeroFeature(
    item: PreviewTitle,
    onPlay: () -> Unit,
    onInfo: () -> Unit,
    inWatchlist: Boolean,
    onToggleWatchlist: () -> Unit,
    modifier: Modifier = Modifier,
) {
    V1GlassPanel(
        modifier = modifier
            .fillMaxWidth()
            .height(210.dp),
        radius = 22.dp,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        0f to Color(0xF20A0D11),
                        0.52f to Color(0xD710151A),
                        1f to item.colors.first().copy(alpha = 0.68f),
                    ),
                ),
        )
        HeroArtwork(item = item, modifier = Modifier.align(Alignment.CenterEnd))

        Column(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(0.62f)
                .padding(start = 25.dp, top = 13.dp, bottom = 13.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                V1Pill("UDVALGT TIL DIG", color = V1Colors.Gold, emphasized = true, dot = V1Colors.Gold)
                V1Pill("4K", color = V1Colors.Cyan)
                V1Pill("HDR", color = V1Colors.Green)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = item.title,
                color = V1Colors.Text,
                fontSize = 30.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = (-1).sp,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                text = "${item.year}   ·   ${item.subtitle}   ·   16+   ·   52 min.",
                color = V1Colors.Muted,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                text = "Et intenst mysterium folder sig ud, mens gamle spor og nye hemmeligheder trækker historien tættere på sandheden.",
                color = V1Colors.Muted,
                fontSize = 10.sp,
                lineHeight = 12.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(7.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                V1Button("Fortsæt", onClick = onPlay, primary = true, icon = Icons.Rounded.PlayArrow)
                V1Button("Mere info", onClick = onInfo, icon = Icons.Rounded.Info)
                V1Button(
                    if (inWatchlist) "På Min liste" else "Min liste",
                    onClick = onToggleWatchlist,
                    icon = if (inWatchlist) Icons.Rounded.Check else Icons.Rounded.Add,
                )
            }
        }
    }
}

@Composable
private fun HeroArtwork(item: PreviewTitle, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .fillMaxWidth(0.48f),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawCircle(
                brush = Brush.radialGradient(
                    listOf(item.colors.getOrElse(1) { V1Colors.Gold }.copy(alpha = 0.85f), Color.Transparent),
                ),
                radius = size.minDimension * 0.6f,
                center = Offset(size.width * 0.68f, size.height * 0.48f),
            )
            repeat(8) { index ->
                val w = size.width * (0.12f + index * 0.018f)
                val h = size.height * (0.42f + index * 0.045f)
                drawRoundRect(
                    color = item.colors[index % item.colors.size].copy(alpha = 0.18f + index * 0.045f),
                    topLeft = Offset(size.width * (0.48f + index * 0.035f), size.height * 0.5f - h / 2),
                    size = Size(w, h),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(22f, 22f),
                )
            }
        }
        Text(
            text = item.title.take(1).uppercase(),
            color = Color.White.copy(alpha = 0.88f),
            fontSize = 88.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 48.dp),
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 18.dp, bottom = 13.dp)
                .background(Color.Black.copy(alpha = 0.42f), RoundedCornerShape(50.dp))
                .border(1.dp, Color.White.copy(alpha = 0.13f), RoundedCornerShape(50.dp))
                .padding(horizontal = 9.dp, vertical = 5.dp),
        ) {
            Text(
                text = "DOLBY VISION  ·  ATMOS",
                color = Color.White.copy(alpha = 0.78f),
                fontSize = 7.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.1.sp,
            )
        }
    }
}

@Composable
private fun PreviewMediaRow(
    row: PreviewRow,
    onFocused: (PreviewTitle) -> Unit,
    onOpenTitle: () -> Unit,
    onLongPress: (PreviewTitle) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        SectionHeader(
            title = row.title,
            secondary = row.secondary,
            modifier = Modifier.padding(start = 25.dp, end = 30.dp),
        )
        LazyRow(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 25.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(row.items, key = { _, item -> "${row.title}-${item.title}" }) { _, item ->
                when (row.shape) {
                    PreviewShape.LANDSCAPE -> LandscapeMediaCard(
                        item = item,
                        onFocused = { onFocused(item) },
                        onClick = onOpenTitle,
                        onLongClick = { onLongPress(item) },
                    )
                    PreviewShape.POSTER -> PosterMediaCard(
                        item = item,
                        onFocused = { onFocused(item) },
                        onClick = onOpenTitle,
                        onLongClick = { onLongPress(item) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(
    title: String,
    secondary: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(20.dp)
                    .background(V1Colors.Gold, RoundedCornerShape(50.dp)),
            )
            Column {
                Text(title, color = V1Colors.Text, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                Text(secondary, color = V1Colors.MutedSoft, fontSize = 8.sp)
            }
        }
        Text(
            text = "SE ALLE  →",
            color = V1Colors.Gold,
            fontSize = 8.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.8.sp,
        )
    }
}

@Composable
private fun LandscapeMediaCard(
    item: PreviewTitle,
    onFocused: () -> Unit,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    Column(modifier = Modifier.width(190.dp)) {
        V1FocusSurface(
            onClick = onClick,
            onLongClick = onLongClick,
            modifier = Modifier
                .width(190.dp)
                .height(106.dp),
            radius = 13.dp,
            onFocused = onFocused,
        ) { focused ->
            CardArtwork(item = item, focused = focused)
            if (focused) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp)
                        .background(V1Colors.Gold, RoundedCornerShape(50.dp))
                        .padding(horizontal = 7.dp, vertical = 4.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.PlayArrow, contentDescription = null, tint = V1Colors.Background, modifier = Modifier.size(10.dp))
                        Text("FORTSÆT", color = V1Colors.Background, fontSize = 7.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = item.title,
            color = V1Colors.Text,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(2.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(item.subtitle, color = V1Colors.Muted, fontSize = 8.sp)
            Text(item.eyebrow, color = V1Colors.Gold, fontSize = 7.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun PosterMediaCard(
    item: PreviewTitle,
    onFocused: () -> Unit,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    Column(modifier = Modifier.width(105.dp)) {
        V1FocusSurface(
            onClick = onClick,
            onLongClick = onLongClick,
            modifier = Modifier
                .width(105.dp)
                .height(145.dp),
            radius = 13.dp,
            onFocused = onFocused,
        ) { focused ->
            CardArtwork(item = item, focused = focused)
            item.badge?.let { badge ->
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(7.dp)
                        .background(
                            if (badge == "NY") V1Colors.Gold else Color.Black.copy(alpha = 0.66f),
                            RoundedCornerShape(50.dp),
                        )
                        .border(1.dp, Color.White.copy(alpha = 0.22f), RoundedCornerShape(50.dp))
                        .padding(horizontal = 7.dp, vertical = 4.dp),
                ) {
                    Text(
                        text = badge,
                        color = if (badge == "NY") V1Colors.Background else V1Colors.Text,
                        fontSize = 7.sp,
                        fontWeight = FontWeight.Black,
                    )
                }
            }
            if (focused) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(8.dp)
                        .background(V1Colors.Gold, CircleShape)
                        .size(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Rounded.PlayArrow, contentDescription = null, tint = V1Colors.Background, modifier = Modifier.size(13.dp))
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = item.title,
            color = V1Colors.Text,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = "${item.eyebrow}  ·  ${item.year}",
            color = V1Colors.MutedSoft,
            fontSize = 7.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun CardArtwork(item: PreviewTitle, focused: Boolean) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.linearGradient(item.colors)),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawCircle(
                color = Color.White.copy(alpha = if (focused) 0.16f else 0.1f),
                radius = size.minDimension * 0.55f,
                center = Offset(size.width * 0.77f, size.height * 0.32f),
            )
            repeat(5) { index ->
                drawRoundRect(
                    color = Color.Black.copy(alpha = 0.07f + index * 0.025f),
                    topLeft = Offset(size.width * (0.05f + index * 0.15f), size.height * (0.23f + index * 0.08f)),
                    size = Size(size.width * 0.31f, size.height * 0.75f),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(26f, 26f),
                )
            }
        }
        Text(
            text = item.title.take(1).uppercase(),
            color = Color.White.copy(alpha = 0.78f),
            fontSize = if (item.title.length < 5) 46.sp else 38.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier.align(Alignment.Center),
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(40.dp)
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.78f)))),
        )
        item.progress?.let { progress ->
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(4.dp)
                    .background(Color.White.copy(alpha = 0.23f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(progress.coerceIn(0f, 1f))
                        .fillMaxHeight()
                        .background(
                            Brush.horizontalGradient(listOf(V1Colors.GoldDeep, V1Colors.Gold, Color(0xFFFFE585))),
                        ),
                )
            }
        }
        if (focused) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.55f),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
                    .size(12.dp),
            )
        }
    }
}
