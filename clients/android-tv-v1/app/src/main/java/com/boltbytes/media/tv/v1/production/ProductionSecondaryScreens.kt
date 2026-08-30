package com.boltbytes.media.tv.v1.production

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.boltbytes.media.tv.v1.ui.V1AmbientBackground
import com.boltbytes.media.tv.v1.ui.V1Button
import com.boltbytes.media.tv.v1.ui.V1Colors
import com.boltbytes.media.tv.v1.ui.V1FocusSurface
import com.boltbytes.media.tv.v1.ui.V1GlassPanel
import com.boltbytes.media.tv.v1.ui.V1Pill
import kotlinx.coroutines.delay
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
internal fun ProductionSearchScreen(state: ProductionUiState, viewModel: ProductionViewModel) {
    val searchFocus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    ProductionInitialFocus(
        key = state.contextCard?.id,
        ready = state.contextCard == null,
        requester = searchFocus,
    )
    LaunchedEffect(Unit) {
        delay(180L)
        searchFocus.requestFocus()
        keyboard?.show()
    }
    V1AmbientBackground(accent = V1Colors.Blue) {
        Column(
            Modifier.fillMaxSize().padding(horizontal = 58.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            ProductionPageHeader("Søg", "Søg i hele biblioteket", viewModel::back)
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = viewModel::search,
                leadingIcon = { Icon(Icons.Rounded.Search, null) },
                placeholder = { Text("Titel, serie, skuespiller eller genre") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(
                    onSearch = {
                        viewModel.search(state.searchQuery)
                        keyboard?.hide()
                    },
                ),
                modifier = Modifier.focusRequester(searchFocus).fillMaxWidth(),
            )
            if (state.searchQuery.length < 2) {
                ProductionEmptyState("Klar til at søge", "Skriv mindst to tegn. Resultaterne opdateres automatisk.")
            } else if (state.searching && state.searchResults.isEmpty()) {
                ProductionInlineLoading("Søger i biblioteket")
            } else if (state.searchResults.isEmpty()) {
                ProductionEmptyState("Ingen resultater", "Prøv en anden titel eller genre.")
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(158.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(state.searchResults, key = { it.id }) { card ->
                        ProductionResultCard(card, viewModel)
                    }
                }
            }
        }
    }
}

@Composable
internal fun ProductionGenreScreen(state: ProductionUiState, viewModel: ProductionViewModel) {
    val genres = remember(state.home) {
        state.home.rows.flatMap { row -> row.cards.flatMap { it.genres } }
            .map(String::trim).filter(String::isNotBlank).distinct().sorted()
    }
    val contentFocus = remember { FocusRequester() }
    val genreFocusKey = "${state.selectedGenre.orEmpty()}:${state.contextCard?.id.orEmpty()}"
    ProductionInitialFocus(
        key = genreFocusKey,
        ready = state.contextCard == null && if (state.selectedGenre == null) genres.isNotEmpty() else state.genreResults.isNotEmpty(),
        requester = contentFocus,
    )
    V1AmbientBackground(accent = V1Colors.GoldDeep) {
        Column(
            Modifier.fillMaxSize().padding(horizontal = 58.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            ProductionPageHeader("Genre", "Opdag film og serier efter stemning", viewModel::back)
            if (state.selectedGenre == null) {
                if (genres.isEmpty()) {
                    ProductionEmptyState("Ingen genrer fundet", "Genrer vises, når biblioteket har metadata.")
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(4),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        items(genres, key = { it }) { genre ->
                            V1FocusSurface(
                                onClick = { viewModel.selectGenre(genre) },
                                modifier = Modifier
                                    .then(if (genre == genres.firstOrNull()) Modifier.focusRequester(contentFocus) else Modifier)
                                    .height(120.dp),
                                radius = 20.dp,
                                focusedScale = 1.035f,
                                background = Brush.linearGradient(listOf(V1Colors.SurfaceSolid, V1Colors.Elevated)),
                                focusedBackground = Brush.linearGradient(listOf(Color(0xFF57441A), Color(0xFF24282D))),
                            ) { focused ->
                                Box(Modifier.fillMaxSize().padding(18.dp)) {
                                    Text("DISCOVERY", color = V1Colors.Gold, fontSize = 8.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp)
                                    Text(genre, color = if (focused) V1Colors.GoldSoft else V1Colors.Text, fontSize = 21.sp, fontWeight = FontWeight.Black, modifier = Modifier.align(Alignment.BottomStart))
                                }
                            }
                        }
                    }
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    V1Button("Alle genrer", { viewModel.openGenre() }, icon = Icons.Rounded.ArrowBack)
                    Text(state.selectedGenre, color = V1Colors.Text, fontSize = 23.sp, fontWeight = FontWeight.Black)
                }
                if (state.loadingGenre && state.genreResults.isEmpty()) {
                    ProductionInlineLoading("Henter ${state.selectedGenre}")
                } else if (state.genreResults.isEmpty()) {
                    ProductionEmptyState("Ingen titler i genren", "Biblioteket har ingen tilgængelige titler i denne genre.")
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(158.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        items(state.genreResults, key = { it.id }) { card ->
                            ProductionResultCard(
                                card,
                                viewModel,
                                modifier = if (card.id == state.genreResults.firstOrNull()?.id) Modifier.focusRequester(contentFocus) else Modifier,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun ProductionLiveTvScreen(state: ProductionUiState, viewModel: ProductionViewModel) {
    var selectedChannelId by remember { mutableStateOf<String?>(null) }
    val selectedChannel = state.channels.firstOrNull { it.id == selectedChannelId } ?: state.channels.firstOrNull()
    val selectedProgram = selectedChannel?.programs?.firstOrNull { it.isLive } ?: selectedChannel?.programs?.firstOrNull()
    val guideFocus = remember { FocusRequester() }
    ProductionInitialFocus(
        key = state.contextCard?.id,
        ready = state.contextCard == null && state.channels.isNotEmpty(),
        requester = guideFocus,
    )
    V1AmbientBackground(accent = V1Colors.Blue) {
        Column(Modifier.fillMaxSize().padding(horizontal = 34.dp, vertical = 22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ProductionPageHeader("Live TV", "12-timers programguide · opdateres hvert minut", viewModel::back)
            V1GlassPanel(Modifier.fillMaxWidth().height(138.dp), radius = 18.dp) {
                Row(Modifier.fillMaxSize().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    AsyncImage(
                        model = selectedChannel?.logoUrl?.let(viewModel.api::resolvePublicUrl),
                        contentDescription = null,
                        modifier = Modifier.size(92.dp).clip(RoundedCornerShape(15.dp)).background(Color.White.copy(alpha = 0.06f)),
                    )
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            V1Pill(if (selectedProgram?.isLive == true) "LIVE" else "PROGRAM", color = if (selectedProgram?.isLive == true) V1Colors.Danger else V1Colors.Blue, emphasized = true)
                            Text(selectedChannel?.name ?: "Vælg en kanal", color = V1Colors.Muted, fontSize = 10.sp)
                        }
                        Text(selectedProgram?.title ?: "Ingen programdata", color = V1Colors.Text, fontSize = 22.sp, fontWeight = FontWeight.Black)
                        Text(selectedProgram?.description.orEmpty(), color = V1Colors.Muted, fontSize = 9.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    selectedChannel?.let { channel ->
                        V1Button("Se kanal", { viewModel.playChannel(channel) }, primary = true, icon = Icons.Rounded.PlayArrow)
                        V1Button(
                            if (channel.favorite) "Favorit" else "Favorit",
                            { viewModel.toggleFavorite(channel) },
                            icon = if (channel.favorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        )
                    }
                }
            }
            if (state.loadingGuide && state.channels.isEmpty()) {
                ProductionInlineLoading("Henter programguiden")
            } else if (state.channels.isEmpty()) {
                ProductionEmptyState("Ingen Live TV-kanaler", "Kontrollér udbyderen eller opdater programguiden på serveren.")
            } else {
                Row(Modifier.fillMaxWidth().height(34.dp).background(Color(0xCC151B22))) {
                    Text("KANAL", color = V1Colors.Muted, fontSize = 8.sp, fontWeight = FontWeight.Black, modifier = Modifier.width(190.dp).padding(11.dp))
                    listOf("Nu", "+30 min", "+60 min", "+90 min").forEach { label ->
                        Text(label, color = V1Colors.Muted, fontSize = 8.sp, modifier = Modifier.weight(1f).padding(11.dp))
                    }
                }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    items(state.channels, key = { it.id }) { channel ->
                        Row(Modifier.fillMaxWidth().height(58.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                            V1FocusSurface(
                                onClick = { selectedChannelId = channel.id },
                                onLongClick = { viewModel.toggleFavorite(channel) },
                                onFocused = { selectedChannelId = channel.id },
                                modifier = Modifier
                                    .then(if (channel.id == state.channels.firstOrNull()?.id) Modifier.focusRequester(guideFocus) else Modifier)
                                    .width(190.dp)
                                    .fillMaxHeight(),
                                radius = 4.dp,
                                focusedScale = 1.01f,
                            ) { focused ->
                                Row(Modifier.fillMaxSize().padding(horizontal = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(channel.number, color = V1Colors.Muted, fontSize = 8.sp, modifier = Modifier.width(25.dp))
                                    AsyncImage(model = channel.logoUrl?.let(viewModel.api::resolvePublicUrl), contentDescription = null, modifier = Modifier.size(32.dp))
                                    Text(channel.name, color = if (focused) V1Colors.Gold else V1Colors.Text, fontSize = 9.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                }
                            }
                            channel.programs.take(4).forEach { program ->
                                V1FocusSurface(
                                    onClick = { if (program.isLive) viewModel.playChannel(channel) else selectedChannelId = channel.id },
                                    modifier = Modifier.weight(1f).fillMaxHeight(),
                                    radius = 4.dp,
                                    focusedScale = 1.01f,
                                    background = Brush.horizontalGradient(listOf(if (program.isLive) Color(0xFF4B3712) else V1Colors.SurfaceSolid, V1Colors.Elevated)),
                                ) { focused ->
                                    Column(Modifier.fillMaxSize().padding(8.dp), verticalArrangement = Arrangement.Center) {
                                        Text(program.title, color = if (focused || program.isLive) V1Colors.Gold else V1Colors.Text, fontSize = 8.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(programTime(program), color = V1Colors.Muted, fontSize = 7.sp)
                                    }
                                }
                            }
                            repeat((4 - channel.programs.take(4).size).coerceAtLeast(0)) {
                                Box(Modifier.weight(1f).fillMaxHeight().background(V1Colors.SurfaceSolid.copy(alpha = 0.56f)))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun ProductionNotificationsScreen(state: ProductionUiState, viewModel: ProductionViewModel) {
    var selectedId by remember { mutableStateOf<String?>(null) }
    val selected = state.notifications.firstOrNull { it.id == selectedId } ?: state.notifications.firstOrNull()
    val notificationFocus = remember { FocusRequester() }
    ProductionInitialFocus(
        key = state.contextCard?.id,
        ready = state.contextCard == null && state.notifications.isNotEmpty(),
        requester = notificationFocus,
    )
    V1AmbientBackground(accent = V1Colors.Blue) {
        Column(Modifier.fillMaxSize().padding(horizontal = 58.dp, vertical = 32.dp), verticalArrangement = Arrangement.spacedBy(17.dp)) {
            ProductionPageHeader("Notifikationer", "${state.unreadCount} ulæste", viewModel::back) {
                V1Button("Markér alle læst", viewModel::markAllRead, icon = Icons.Rounded.Check)
            }
            if (state.loadingNotifications && state.notifications.isEmpty()) {
                ProductionInlineLoading("Henter notifikationer")
            } else if (state.notifications.isEmpty()) {
                ProductionEmptyState("Ingen notifikationer", "Nye beskeder fra serveren vises her.")
            } else Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                LazyColumn(Modifier.weight(0.92f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.notifications, key = { it.id }) { notification ->
                        V1FocusSurface(
                            onClick = { selectedId = notification.id; viewModel.markRead(notification) },
                            onFocused = { selectedId = notification.id },
                            modifier = Modifier
                                .then(if (notification.id == state.notifications.firstOrNull()?.id) Modifier.focusRequester(notificationFocus) else Modifier)
                                .fillMaxWidth()
                                .height(82.dp),
                            radius = 15.dp,
                        ) { focused ->
                            Row(Modifier.fillMaxSize().padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Box(Modifier.size(8.dp).background(if (notification.read) V1Colors.Border else V1Colors.Gold, CircleShape))
                                Column(Modifier.weight(1f)) {
                                    Text(notification.title, color = if (focused) V1Colors.Gold else V1Colors.Text, fontSize = 11.sp, fontWeight = if (notification.read) FontWeight.Medium else FontWeight.Black, maxLines = 1)
                                    Text(notification.message, color = V1Colors.Muted, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                Text(notification.createdAt.take(10), color = V1Colors.MutedSoft, fontSize = 7.sp)
                            }
                        }
                    }
                }
                V1GlassPanel(Modifier.weight(1.08f).fillMaxHeight()) {
                    Column(Modifier.fillMaxSize().padding(28.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Rounded.Notifications, null, tint = V1Colors.Gold, modifier = Modifier.size(31.dp))
                        Text(selected?.title ?: "Vælg en notifikation", color = V1Colors.Text, fontSize = 25.sp, fontWeight = FontWeight.Black)
                        Text(selected?.createdAt.orEmpty(), color = V1Colors.Muted, fontSize = 9.sp)
                        Text(selected?.message.orEmpty(), color = V1Colors.Muted, fontSize = 12.sp, lineHeight = 19.sp)
                    }
                }
            }
        }
    }
}

@Composable
internal fun ProductionDownloadsScreen(state: ProductionUiState, viewModel: ProductionViewModel) {
    val downloadFocus = remember { FocusRequester() }
    ProductionInitialFocus(
        key = state.contextCard?.id,
        ready = state.contextCard == null && state.downloads.isNotEmpty(),
        requester = downloadFocus,
    )
    V1AmbientBackground(accent = V1Colors.Green) {
        Column(Modifier.fillMaxSize().padding(horizontal = 58.dp, vertical = 32.dp), verticalArrangement = Arrangement.spacedBy(17.dp)) {
            ProductionPageHeader("Downloads", "Offlineindhold og licenser", viewModel::back) {
                V1Button("Opdater", viewModel::openDownloads, icon = Icons.Rounded.Refresh)
            }
            if (state.loadingDownloads && state.downloads.isEmpty()) {
                ProductionInlineLoading("Henter downloads")
            } else if (state.downloads.isEmpty()) {
                ProductionEmptyState("Ingen downloads", "Downloads, der tilhører den aktive profil, vises her.")
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.downloads, key = { it.id }) { download ->
                        V1GlassPanel(Modifier.fillMaxWidth().height(112.dp), radius = 17.dp) {
                            Row(Modifier.fillMaxSize().padding(15.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(15.dp)) {
                                Box(Modifier.size(72.dp).background(V1Colors.Elevated, RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Rounded.Download, null, tint = if (download.playable) V1Colors.Green else V1Colors.Muted, modifier = Modifier.size(30.dp))
                                }
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(download.title, color = V1Colors.Text, fontSize = 14.sp, fontWeight = FontWeight.Black)
                                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                        V1Pill(download.status, color = if (download.playable) V1Colors.Green else V1Colors.Gold, emphasized = true)
                                        V1Pill(download.quality)
                                        V1Pill(formatBytes(download.sizeBytes))
                                    }
                                    Box(Modifier.fillMaxWidth().height(4.dp).background(V1Colors.Border, RoundedCornerShape(3.dp))) {
                                        Box(Modifier.fillMaxWidth(download.progress).fillMaxHeight().background(if (download.playable) V1Colors.Green else V1Colors.Gold, RoundedCornerShape(3.dp)))
                                    }
                                    download.error?.let { Text(it, color = V1Colors.Danger, fontSize = 8.sp, maxLines = 1) }
                                }
                                V1Button(
                                    "Forny",
                                    { viewModel.renewDownload(download) },
                                    modifier = if (download.id == state.downloads.firstOrNull()?.id) Modifier.focusRequester(downloadFocus) else Modifier,
                                    icon = Icons.Rounded.Refresh,
                                )
                                V1Button("Slet", { viewModel.removeDownload(download) }, icon = Icons.Rounded.Delete)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun ProductionSettingsScreen(state: ProductionUiState, viewModel: ProductionViewModel) {
    val value = state.preferences
    var category by remember { mutableStateOf("Afspilning") }
    val categoryFocus = remember { FocusRequester() }
    ProductionInitialFocus(
        key = state.contextCard?.id,
        ready = state.contextCard == null,
        requester = categoryFocus,
    )
    V1AmbientBackground(accent = V1Colors.GoldDeep) {
        Column(Modifier.fillMaxSize().padding(horizontal = 58.dp, vertical = 32.dp), verticalArrangement = Arrangement.spacedBy(17.dp)) {
            ProductionPageHeader("Indstillinger", "Profil- og enhedsvalg gemmes samlet", viewModel::back) {
                V1Button("Gem ændringer", viewModel::savePreferences, primary = true, icon = Icons.Rounded.Save)
            }
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                V1GlassPanel(Modifier.width(250.dp).fillMaxHeight()) {
                    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        listOf("Afspilning", "Billede", "Sprog", "Oplevelse", "System").forEachIndexed { index, label ->
                            V1Button(
                                label,
                                { category = label },
                                primary = category == label,
                                icon = Icons.Rounded.Settings,
                                modifier = Modifier
                                    .then(if (index == 0) Modifier.focusRequester(categoryFocus) else Modifier)
                                    .fillMaxWidth(),
                            )
                        }
                    }
                }
                V1GlassPanel(Modifier.weight(1f).fillMaxHeight()) {
                    LazyColumn(Modifier.fillMaxSize().padding(26.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        item { Text(category, color = V1Colors.Text, fontSize = 24.sp, fontWeight = FontWeight.Black) }
                        when (category) {
                            "Afspilning" -> {
                                item { ProductionChoice("Kvalitet", qualityLabel(value), listOf("Auto", "Original", "2160p", "1080p", "720p")) { label ->
                                    viewModel.updatePreferences(
                                        when (label) {
                                            "Auto" -> value.copy(qualityMode = "auto", maxHeight = null)
                                            "Original" -> value.copy(qualityMode = "original", maxHeight = null)
                                            else -> value.copy(qualityMode = "fixed", maxHeight = label.removeSuffix("p").toInt())
                                        },
                                    )
                                } }
                                item { ProductionToggle("Data saver", "Reducerer dataforbruget på langsomme forbindelser", value.dataSaver) { viewModel.updatePreferences(value.copy(dataSaver = it)) } }
                                item { ProductionToggle("Autoplay næste afsnit", "Starter kun efter faktisk afslutning", value.autoplay) { viewModel.updatePreferences(value.copy(autoplay = it)) } }
                            }
                            "Billede" -> {
                                item { ProductionToggle("Tillad opskalering", "Lader serveren skabe højere adaptive videoniveauer, når kilden er mindre end skærmen", value.allowUpscale && value.upscaleMode != "off") { enabled ->
                                    viewModel.updatePreferences(value.copy(allowUpscale = enabled, upscaleMode = if (enabled) "server" else "off"))
                                } }
                                item { ProductionChoice("Opskalering", if (value.allowUpscale && value.upscaleMode != "off") "Server" else "Fra", listOf("Fra", "Server")) { label ->
                                    viewModel.updatePreferences(value.copy(allowUpscale = label == "Server", upscaleMode = if (label == "Server") "server" else "off"))
                                } }
                                item { ProductionToggle("HDR", "Brug HDR, når skærm og stream understøtter det", value.hdr) { viewModel.updatePreferences(value.copy(hdr = it)) } }
                            }
                            "Sprog" -> {
                                item { ProductionChoice("Lydsprog", value.audioLanguage.uppercase(), listOf("DA", "EN", "DE", "SV", "NO")) { viewModel.updatePreferences(value.copy(audioLanguage = it.lowercase())) } }
                                item { ProductionChoice("Undertekstsprog", value.subtitleLanguage.uppercase(), listOf("DA", "EN", "DE", "SV", "NO")) { viewModel.updatePreferences(value.copy(subtitleLanguage = it.lowercase())) } }
                                item { ProductionChoice("Undertekster", value.subtitleMode.replaceFirstChar(Char::uppercase), listOf("Auto", "Til", "Fra")) { viewModel.updatePreferences(value.copy(subtitleMode = it.lowercase())) } }
                            }
                            "Oplevelse" -> {
                                item { ProductionToggle("Anbefalinger", "Brug din historik til personlige rækker", value.recommendations) { viewModel.updatePreferences(value.copy(recommendations = it)) } }
                                item { ProductionChoice("Afspilningshastighed", "${value.playbackRate}x", listOf("0.75x", "1.0x", "1.25x", "1.5x", "2.0x")) { label -> viewModel.updatePreferences(value.copy(playbackRate = label.removeSuffix("x").toFloat())) } }
                            }
                            else -> {
                                item { ProductionUpdatePanel(state.updateState, viewModel) }
                                item { ProductionDiagnosticsPanel() }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductionUpdatePanel(update: ProductionUpdateState, viewModel: ProductionViewModel) {
    V1GlassPanel(Modifier.fillMaxWidth().height(210.dp), radius = 17.dp) {
        Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("TV-software", color = V1Colors.Text, fontSize = 17.sp, fontWeight = FontWeight.Black)
            Text(
                when (update) {
                    ProductionUpdateState.Idle -> "Kontrollér den signerede GitHub-release for en nyere version."
                    ProductionUpdateState.Checking -> "Kontrollerer GitHub Release…"
                    is ProductionUpdateState.UpToDate -> "Version ${update.version} er opdateret."
                    is ProductionUpdateState.Available -> "Version ${update.version} er klar. ${update.notes}"
                    is ProductionUpdateState.Downloading -> "Downloader ${update.version}: ${(update.progress * 100).toInt()} %"
                    is ProductionUpdateState.Ready -> "Version ${update.version} er valideret og klar til Androids installationsdialog."
                    is ProductionUpdateState.PermissionRequired -> "Tillad installation fra BoltBytes TV og vælg derefter Installer igen."
                    is ProductionUpdateState.Failure -> update.message
                },
                color = if (update is ProductionUpdateState.Failure) V1Colors.Danger else V1Colors.Muted,
                fontSize = 10.sp,
                lineHeight = 16.sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            if (update is ProductionUpdateState.Downloading) {
                Box(Modifier.fillMaxWidth().height(5.dp).background(V1Colors.Border, RoundedCornerShape(4.dp))) {
                    Box(Modifier.fillMaxWidth(update.progress).fillMaxHeight().background(V1Colors.Gold, RoundedCornerShape(4.dp)))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                when (update) {
                    is ProductionUpdateState.Available -> V1Button("Download ${update.version}", viewModel::downloadUpdate, primary = true, icon = Icons.Rounded.Download)
                    is ProductionUpdateState.Ready,
                    is ProductionUpdateState.PermissionRequired -> V1Button("Installer", viewModel::installUpdate, primary = true, icon = Icons.Rounded.Check)
                    ProductionUpdateState.Checking,
                    is ProductionUpdateState.Downloading -> Unit
                    else -> V1Button("Søg efter opdatering", viewModel::checkForUpdate, icon = Icons.Rounded.Refresh)
                }
            }
        }
    }
}

@Composable
private fun ProductionDiagnosticsPanel() {
    val diagnostics by ProductionPlaybackDiagnosticsStore.state.collectAsStateWithLifecycle()
    V1GlassPanel(Modifier.fillMaxWidth().height(285.dp), radius = 17.dp) {
        Column(
            Modifier.fillMaxSize().padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Playback-diagnostik", color = V1Colors.Text, fontSize = 17.sp, fontWeight = FontWeight.Black)
            Text("Fase: ${diagnostics.phase}", color = V1Colors.Gold, fontSize = 10.sp)
            Text("Session: ${diagnostics.sessionId?.take(12) ?: "Ingen"}", color = V1Colors.Muted, fontSize = 9.sp)
            Text("Metode: ${diagnostics.streamMethod ?: "Ukendt"} · Netværk: ${if (diagnostics.networkOnline) "Online" else "Offline"}", color = V1Colors.Muted, fontSize = 9.sp)
            Text("Kvalitet: ${diagnostics.videoHeight?.let { "${it}p" } ?: "Auto"} · ${diagnostics.videoBitrate?.let { "${it / 1000} kbps" } ?: "ukendt bitrate"}", color = V1Colors.Muted, fontSize = 9.sp)
            Text("Buffer foran: ${diagnostics.bufferAheadMs / 1000}s · stalls: ${diagnostics.stallCount} · retry: ${diagnostics.retryAttempt}", color = V1Colors.Muted, fontSize = 9.sp)
            Text("Tabte frames: ${diagnostics.droppedFrames}", color = V1Colors.Muted, fontSize = 9.sp)
            diagnostics.lastError?.takeIf(String::isNotBlank)?.let { error ->
                Text("Seneste fejl: $error", color = V1Colors.Danger, fontSize = 9.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun ProductionChoice(title: String, current: String, options: List<String>, onSelect: (String) -> Unit) {
    V1GlassPanel(Modifier.fillMaxWidth().height(102.dp), radius = 15.dp) {
        Row(Modifier.fillMaxSize().padding(15.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(Modifier.width(190.dp)) {
                Text(title, color = V1Colors.Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text(current, color = V1Colors.Gold, fontSize = 9.sp)
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(options, key = { it }) { option -> V1Button(option, { onSelect(option) }, primary = option.equals(current, true)) }
            }
        }
    }
}

@Composable
private fun ProductionToggle(title: String, description: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    V1FocusSurface(onClick = { onChange(!checked) }, modifier = Modifier.fillMaxWidth().height(82.dp), radius = 15.dp) { focused ->
        Row(Modifier.fillMaxSize().padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, color = if (focused) V1Colors.Gold else V1Colors.Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text(description, color = V1Colors.Muted, fontSize = 8.sp)
            }
            Box(
                Modifier.width(48.dp).height(26.dp).background(if (checked) V1Colors.Gold else V1Colors.Border, RoundedCornerShape(20.dp)).padding(4.dp),
            ) {
                Box(Modifier.size(18.dp).align(if (checked) Alignment.CenterEnd else Alignment.CenterStart).background(if (checked) V1Colors.Background else V1Colors.Muted, CircleShape))
            }
        }
    }
}

@Composable
private fun ProductionResultCard(
    card: ProductionCard,
    viewModel: ProductionViewModel,
    modifier: Modifier = Modifier,
) {
    V1FocusSurface(
        onClick = { viewModel.openCard(card) },
        onLongClick = { viewModel.showContext(card) },
        modifier = modifier.width(156.dp).height(232.dp),
        radius = 16.dp,
        focusedScale = 1.045f,
    ) { focused ->
        Column(Modifier.fillMaxSize()) {
            AsyncImage(model = card.posterUrl?.let(viewModel.api::resolvePublicUrl), contentDescription = null, modifier = Modifier.fillMaxWidth().height(174.dp).background(V1Colors.Elevated))
            Column(Modifier.padding(9.dp)) {
                Text(card.title, color = if (focused) V1Colors.Gold else V1Colors.Text, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(card.subtitle, color = V1Colors.Muted, fontSize = 8.sp, maxLines = 1)
            }
        }
    }
}

@Composable
private fun ProductionInitialFocus(
    key: Any?,
    ready: Boolean,
    requester: FocusRequester,
) {
    var applied by remember(key) { mutableStateOf(false) }
    LaunchedEffect(key, ready) {
        if (ready && !applied) {
            delay(100L)
            runCatching { requester.requestFocus() }
            applied = true
        }
    }
}

@Composable
private fun ProductionPageHeader(title: String, subtitle: String, onBack: () -> Unit, action: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        V1Button("Tilbage", onBack, icon = Icons.Rounded.ArrowBack)
        Column(Modifier.weight(1f)) {
            Text(title, color = V1Colors.Text, fontSize = 27.sp, fontWeight = FontWeight.Black)
            Text(subtitle, color = V1Colors.Muted, fontSize = 9.sp)
        }
        action?.invoke()
    }
}

private fun programTime(program: ProductionProgram): String {
    val formatter = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())
    return listOfNotNull(program.startsAt?.let(formatter::format), program.endsAt?.let(formatter::format)).joinToString(" – ")
}

private fun formatBytes(bytes: Long): String = when {
    bytes <= 0 -> "Ukendt størrelse"
    bytes >= 1_073_741_824L -> "%.1f GB".format(bytes / 1_073_741_824.0)
    else -> "%.0f MB".format(bytes / 1_048_576.0)
}

private fun qualityLabel(value: ProductionPreferences): String = when (value.qualityMode) {
    "original" -> "Original"
    "fixed" -> "${value.maxHeight ?: 1080}p"
    else -> "Auto"
}
