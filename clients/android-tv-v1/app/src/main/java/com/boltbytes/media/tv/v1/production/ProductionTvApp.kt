package com.boltbytes.media.tv.v1.production

import android.app.Activity
import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import com.boltbytes.media.tv.v1.ui.V1AmbientBackground
import com.boltbytes.media.tv.v1.ui.V1Button
import com.boltbytes.media.tv.v1.ui.V1Colors
import com.boltbytes.media.tv.v1.ui.V1FocusSurface
import com.boltbytes.media.tv.v1.ui.V1GlassPanel
import com.boltbytes.media.tv.v1.ui.V1Pill
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

@Composable
fun ProductionTvApp(viewModel: ProductionViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val activity = LocalActivity.current
    BackHandler(enabled = state.route != ProductionRoute.Boot) { viewModel.back() }

    Box(Modifier.fillMaxSize().background(V1Colors.Background)) {
        when (val route = state.route) {
            ProductionRoute.Boot -> ProductionBootScreen()
            ProductionRoute.Login -> ProductionLoginScreen(state, viewModel)
            ProductionRoute.Profiles -> ProductionProfilesScreen(state, viewModel)
            ProductionRoute.Hub -> ProductionHubScreen(state, viewModel)
            ProductionRoute.Search -> ProductionSearchScreen(state, viewModel)
            ProductionRoute.Genre -> ProductionGenreScreen(state, viewModel)
            ProductionRoute.LiveTv -> ProductionLiveTvScreen(state, viewModel)
            ProductionRoute.Downloads -> ProductionDownloadsScreen(state, viewModel)
            ProductionRoute.Notifications -> ProductionNotificationsScreen(state, viewModel)
            ProductionRoute.Settings -> ProductionSettingsScreen(state, viewModel)
            is ProductionRoute.Title -> ProductionTitleScreen(state, viewModel)
            is ProductionRoute.Player -> ProductionPlayerScreen(
                api = viewModel.api,
                request = route.request,
                preferences = state.preferences,
                onExit = viewModel::closePlayer,
                onEnded = { viewModel.playerEnded(route.request) },
            )
        }

        if (state.busy && state.route != ProductionRoute.Boot && state.route !is ProductionRoute.Player) {
            Box(
                Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.38f)),
                contentAlignment = Alignment.Center,
            ) {
                V1GlassPanel(Modifier.size(104.dp), radius = 52.dp) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(42.dp).align(Alignment.Center),
                        color = V1Colors.Gold,
                        strokeWidth = 3.dp,
                    )
                }
            }
        }

        state.message?.let { message ->
            Box(Modifier.fillMaxSize().padding(top = 24.dp), contentAlignment = Alignment.TopCenter) {
                ProductionMessage(message = message, onDismiss = viewModel::clearMessage)
            }
        }

        if (state.confirmExit) {
            ProductionConfirmOverlay(
                title = "Afslut BoltBytes TV?",
                message = "Du forbliver logget ind næste gang appen åbnes.",
                confirmLabel = "Afslut",
                onConfirm = { activity?.finish() },
                onDismiss = viewModel::dismissExit,
            )
        }
    }
}

@Composable
private fun ProductionBootScreen() {
    V1AmbientBackground(accent = V1Colors.Gold) {
        Column(
            Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Text("BOLTBYTES", color = V1Colors.Gold, fontSize = 14.sp, fontWeight = FontWeight.Black, letterSpacing = 4.sp)
            Text("TV", color = V1Colors.Text, fontSize = 56.sp, fontWeight = FontWeight.Black)
            CircularProgressIndicator(color = V1Colors.Gold, strokeWidth = 3.dp, modifier = Modifier.size(34.dp))
        }
    }
}

@Composable
private fun ProductionLoginScreen(state: ProductionUiState, viewModel: ProductionViewModel) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    V1AmbientBackground(accent = V1Colors.Blue) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 72.dp, vertical = 48.dp),
            horizontalArrangement = Arrangement.spacedBy(44.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1.06f), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Text("BOLTBYTES TV", color = V1Colors.Gold, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 2.8.sp)
                Text("Velkommen tilbage", color = V1Colors.Text, fontSize = 42.sp, fontWeight = FontWeight.Black)
                Text(
                    "Log ind med email og adgangskode. Serveren er sikkert fastlåst til BoltBytes Media.",
                    color = V1Colors.Muted,
                    fontSize = 14.sp,
                    lineHeight = 21.sp,
                    modifier = Modifier.width(560.dp),
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Adgangskode") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    V1Button("Log ind", { viewModel.login(email, password) }, primary = true, icon = Icons.Rounded.PlayArrow)
                    V1Button("Prøv igen", viewModel::bootstrap, icon = Icons.Rounded.Refresh)
                }
            }

            V1GlassPanel(Modifier.weight(0.76f).fillMaxHeight(0.84f)) {
                Column(
                    Modifier.fillMaxSize().padding(30.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text("LOG IND MED QR", color = V1Colors.Gold, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.8.sp)
                    Spacer(Modifier.height(14.dp))
                    val qr = state.qr
                    if (qr != null) {
                        val bitmap = remember(qr.approvalUrl) { qrBitmap(qr.approvalUrl, 420) }
                        Box(
                            Modifier.size(226.dp).clip(RoundedCornerShape(18.dp)).background(Color.White).padding(12.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Image(bitmap.asImageBitmap(), contentDescription = "QR-login", modifier = Modifier.fillMaxSize())
                        }
                        Spacer(Modifier.height(14.dp))
                        Text(qr.userCode, color = V1Colors.Text, fontSize = 20.sp, fontWeight = FontWeight.Black, letterSpacing = 3.sp)
                        Text("Scan med telefonen. Koden opdateres automatisk.", color = V1Colors.Muted, fontSize = 11.sp)
                    } else {
                        CircularProgressIndicator(color = V1Colors.Gold, modifier = Modifier.size(42.dp))
                        Spacer(Modifier.height(16.dp))
                        V1Button("Ny QR-kode", viewModel::startQr, icon = Icons.Rounded.Refresh)
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductionProfilesScreen(state: ProductionUiState, viewModel: ProductionViewModel) {
    var pendingProfile by remember { mutableStateOf<ProductionProfile?>(null) }
    V1AmbientBackground(accent = V1Colors.GoldDeep) {
        Column(
            Modifier.fillMaxSize().padding(horizontal = 86.dp, vertical = 54.dp),
            verticalArrangement = Arrangement.spacedBy(30.dp),
        ) {
            Text("Hvem ser med?", color = V1Colors.Text, fontSize = 38.sp, fontWeight = FontWeight.Black)
            Text("Profilen holder historik, anbefalinger og PIN adskilt.", color = V1Colors.Muted, fontSize = 13.sp)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                items(state.profiles, key = { it.id }) { profile ->
                    V1FocusSurface(
                        onClick = {
                            if (profile.hasPin) pendingProfile = profile else viewModel.selectProfile(profile, null)
                        },
                        modifier = Modifier.width(190.dp).height(244.dp),
                        radius = 24.dp,
                        focusedScale = 1.045f,
                    ) { focused ->
                        Column(
                            Modifier.fillMaxSize().padding(14.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            AsyncImage(
                                model = profile.avatarUrl?.let(viewModel.api::resolvePublicUrl),
                                contentDescription = null,
                                modifier = Modifier.size(126.dp).clip(CircleShape).background(V1Colors.Elevated),
                            )
                            Spacer(Modifier.height(15.dp))
                            Text(profile.name, color = if (focused) V1Colors.Gold else V1Colors.Text, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
                            Text(if (profile.hasPin) "PIN-beskyttet" else if (profile.isKids) "Børneprofil" else "Klar", color = V1Colors.Muted, fontSize = 10.sp)
                        }
                    }
                }
            }
        }
        pendingProfile?.let { profile ->
            ProductionPinOverlay(
                profile = profile,
                onSubmit = { pin -> pendingProfile = null; viewModel.selectProfile(profile, pin) },
                onDismiss = { pendingProfile = null },
            )
        }
    }
}

@Composable
private fun ProductionHubScreen(state: ProductionUiState, viewModel: ProductionViewModel) {
    val visibleRows = remember(state.home, state.hubFilter) {
        state.home.rows.mapNotNull { row ->
            val cards = row.cards.filter { card ->
                when (state.hubFilter) {
                    "movies" -> card.type.contains("movie", true) || card.type.contains("film", true)
                    "series" -> card.type.contains("series", true) || card.type.contains("episode", true)
                    "continue" -> card.progress in 0.001f..0.949f
                    else -> true
                }
            }
            if (cards.isEmpty()) null else row.copy(cards = cards)
        }
    }
    val hero = state.selectedHero ?: visibleRows.firstOrNull()?.cards?.firstOrNull()
    V1AmbientBackground(accent = V1Colors.Blue) {
        (hero?.backdropUrl ?: hero?.posterUrl)?.let { url ->
            AsyncImage(
                model = viewModel.api.resolvePublicUrl(url),
                contentDescription = null,
                modifier = Modifier.fillMaxWidth().fillMaxHeight(0.55f).align(Alignment.TopCenter),
                alpha = 0.46f,
                contentScale = ContentScale.Crop,
            )
            Box(
                Modifier.fillMaxWidth().fillMaxHeight(0.66f).align(Alignment.TopCenter)
                    .background(Brush.verticalGradient(listOf(Color.Transparent, V1Colors.Background))),
            )
        }
        Row(Modifier.fillMaxSize()) {
            ProductionRail(state, viewModel)
            LazyColumn(
                Modifier.fillMaxSize().padding(start = 28.dp, end = 36.dp, top = 30.dp, bottom = 22.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                item {
                    ProductionHero(hero = hero, onOpen = { hero?.let(viewModel::openCard) }, onPlay = { hero?.let { viewModel.playCard(it) } })
                }
                if (visibleRows.isEmpty()) {
                    item { ProductionEmptyState("Ingen titler her endnu", "Prøv Hjem eller Søg for at finde noget at se.") }
                }
                visibleRows.forEach { row ->
                    item(key = row.id) {
                        ProductionMediaRow(row, viewModel)
                    }
                }
            }
        }
        state.contextCard?.let { card ->
            ProductionCardMenu(card, viewModel)
        }
    }
}

@Composable
private fun ProductionRail(state: ProductionUiState, viewModel: ProductionViewModel) {
    val items = listOf(
        Triple("home", "Hjem", Icons.Rounded.Home),
        Triple("movies", "Film", Icons.Rounded.VideoLibrary),
        Triple("series", "Serier", Icons.Rounded.VideoLibrary),
        Triple("live", "Live TV", Icons.Rounded.LiveTv),
        Triple("continue", "Fortsæt", Icons.Rounded.PlayArrow),
        Triple("genre", "Genre", Icons.Rounded.VideoLibrary),
        Triple("search", "Søg", Icons.Rounded.Search),
        Triple("downloads", "Downloads", Icons.Rounded.Download),
        Triple("notifications", "Notifikationer", Icons.Rounded.Notifications),
        Triple("settings", "Indstillinger", Icons.Rounded.Settings),
        Triple("profile", "Min profil", Icons.Rounded.Person),
    )
    Column(
        Modifier.width(76.dp).fillMaxHeight().background(Color(0xD90A0E13)).padding(vertical = 18.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text("BB", color = V1Colors.Gold, fontSize = 16.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(8.dp))
        items.forEach { (id, label, icon) ->
            V1FocusSurface(
                onClick = {
                    when (id) {
                        "home", "movies", "series", "continue" -> viewModel.selectHubFilter(id)
                        "live" -> viewModel.openLiveTv()
                        "genre" -> viewModel.openGenre()
                        "search" -> viewModel.openSearch()
                        "downloads" -> viewModel.openDownloads()
                        "notifications" -> viewModel.openNotifications()
                        "settings" -> viewModel.openSettings()
                        "profile" -> viewModel.openProfiles()
                    }
                },
                modifier = Modifier.size(44.dp),
                radius = 15.dp,
                focusedScale = 1.06f,
            ) { focused ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Icon(icon, label, tint = if (focused || state.hubFilter == id) V1Colors.Gold else V1Colors.Muted, modifier = Modifier.size(19.dp))
                    if (id == "notifications" && state.unreadCount > 0) {
                        Box(
                            Modifier.align(Alignment.TopEnd).size(17.dp).background(V1Colors.Danger, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) { Text(state.unreadCount.coerceAtMost(9).toString(), color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Black) }
                    }
                }
            }
        }
        Spacer(Modifier.weight(1f))
        V1FocusSurface(onClick = viewModel::logout, modifier = Modifier.size(44.dp), radius = 15.dp) { focused ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.Logout, "Log ud", tint = if (focused) V1Colors.Gold else V1Colors.Muted)
            }
        }
    }
}

@Composable
private fun ProductionHero(hero: ProductionCard?, onOpen: () -> Unit, onPlay: () -> Unit) {
    Column(Modifier.fillMaxWidth().height(250.dp), verticalArrangement = Arrangement.Bottom) {
        Text("BOLTBYTES ORIGINAL", color = V1Colors.Gold, fontSize = 9.sp, fontWeight = FontWeight.Black, letterSpacing = 1.7.sp)
        Spacer(Modifier.height(7.dp))
        Text(hero?.title ?: "Dit personlige TV-bibliotek", color = V1Colors.Text, fontSize = 39.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(hero?.subtitle.orEmpty(), color = V1Colors.Muted, fontSize = 12.sp)
        Spacer(Modifier.height(13.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            V1Button(if ((hero?.startPositionMs ?: 0L) > 0L) "Fortsæt" else "Afspil", onPlay, primary = true, icon = Icons.Rounded.PlayArrow)
            V1Button("Detaljer", onOpen, icon = Icons.Rounded.VideoLibrary)
        }
    }
}

@Composable
private fun ProductionMediaRow(row: ProductionRow, viewModel: ProductionViewModel) {
    val directPlayback = row.startsPlaybackDirectly()
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            Box(Modifier.width(4.dp).height(18.dp).background(V1Colors.Gold, RoundedCornerShape(4.dp)))
            Text(row.title, color = V1Colors.Text, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
            Text("${row.cards.size}", color = V1Colors.MutedSoft, fontSize = 10.sp)
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(horizontal = 5.dp, vertical = 6.dp)) {
            items(row.cards, key = { "${row.id}-${it.id}" }) { card ->
                ProductionMediaCard(card, viewModel, directPlayback)
            }
        }
    }
}

@Composable
private fun ProductionMediaCard(card: ProductionCard, viewModel: ProductionViewModel, directPlayback: Boolean) {
    V1FocusSurface(
        onClick = {
            if (directPlayback) {
                viewModel.playCard(card)
            } else {
                viewModel.openCard(card)
            }
        },
        onLongClick = { viewModel.showContext(card) },
        onFocused = { viewModel.selectHero(card) },
        modifier = Modifier.width(154.dp).height(232.dp),
        radius = 16.dp,
        focusedScale = 1.055f,
    ) { focused ->
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxWidth().height(174.dp).background(V1Colors.Elevated)) {
                AsyncImage(
                    model = (card.posterUrl ?: card.backdropUrl)?.let(viewModel.api::resolvePublicUrl),
                    contentDescription = card.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
                card.badge?.let { badge ->
                    V1Pill(badge, modifier = Modifier.align(Alignment.TopEnd).padding(7.dp), color = V1Colors.Gold, emphasized = true)
                }
                if (card.progress > 0f) {
                    Box(Modifier.fillMaxWidth().height(4.dp).align(Alignment.BottomCenter).background(V1Colors.Border)) {
                        Box(Modifier.fillMaxWidth(card.progress).fillMaxHeight().background(V1Colors.Gold))
                    }
                }
            }
            Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                Text(card.title, color = if (focused) V1Colors.Gold else V1Colors.Text, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(card.subtitle, color = V1Colors.Muted, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun ProductionCardMenu(card: ProductionCard, viewModel: ProductionViewModel) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.62f))) {
        V1GlassPanel(Modifier.width(390.dp).fillMaxHeight().align(Alignment.CenterEnd), radius = 0.dp) {
            Column(Modifier.fillMaxSize().padding(34.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                Text(card.title, color = V1Colors.Text, fontSize = 25.sp, fontWeight = FontWeight.Black, maxLines = 2)
                Text("Hurtigmenu", color = V1Colors.Gold, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.5.sp)
                Spacer(Modifier.height(6.dp))
                V1Button(if (card.startPositionMs > 0) "Fortsæt" else "Afspil", { viewModel.playCard(card) }, primary = true, icon = Icons.Rounded.PlayArrow)
                V1Button("Start forfra", { viewModel.playCard(card, true) }, icon = Icons.Rounded.Refresh)
                V1Button("Gå til serie/titel", { viewModel.closeContext(); viewModel.openCard(card) }, icon = Icons.Rounded.VideoLibrary)
                V1Button("Føj til Min liste", { viewModel.contextWatchlist(card) }, icon = Icons.Rounded.Add)
                V1Button("Markér som set", { viewModel.contextSetWatched(card) }, icon = Icons.Rounded.Check)
                V1Button("Fjern fra Fortsæt", { viewModel.contextRemoveContinue(card) }, icon = Icons.Rounded.Delete)
                Spacer(Modifier.weight(1f))
                V1Button("Luk", viewModel::closeContext, icon = Icons.Rounded.Close)
            }
        }
    }
}

@Composable
private fun ProductionTitleScreen(state: ProductionUiState, viewModel: ProductionViewModel) {
    val title = state.title
    var selectedSeason by remember(title?.id) { mutableStateOf(title?.seasons?.firstOrNull()?.number ?: 1) }
    V1AmbientBackground(accent = V1Colors.GoldDeep) {
        (title?.backdropUrl ?: title?.posterUrl)?.let { url ->
            AsyncImage(model = viewModel.api.resolvePublicUrl(url), contentDescription = null, modifier = Modifier.fillMaxWidth().fillMaxHeight(0.64f).align(Alignment.TopCenter), alpha = 0.42f, contentScale = ContentScale.Crop)
            Box(Modifier.fillMaxWidth().fillMaxHeight(0.7f).background(Brush.verticalGradient(listOf(Color.Transparent, V1Colors.Background))))
        }
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 66.dp, vertical = 34.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item { V1Button("Tilbage", viewModel::back, icon = Icons.Rounded.ArrowBack) }
            if (title == null && state.loadingTitle) {
                item { ProductionInlineLoading("Henter titel og afsnit") }
            } else if (title == null) {
                item { ProductionEmptyState("Titlen kunne ikke vises", "Gå tilbage og prøv igen.") }
            }
            if (title != null) {
                item {
                    Column(Modifier.fillMaxWidth().height(275.dp), verticalArrangement = Arrangement.Bottom) {
                        Text(title.title, color = V1Colors.Text, fontSize = 43.sp, fontWeight = FontWeight.Black)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 9.dp)) {
                            title.year?.let { V1Pill(it) }
                            title.contentRating?.let { V1Pill(it) }
                            title.genres.take(3).forEach { V1Pill(it) }
                        }
                        Text(title.summary, color = V1Colors.Muted, fontSize = 12.sp, lineHeight = 18.sp, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(760.dp))
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            V1Button(if ((title.resumeEpisode?.startPositionMs ?: title.startPositionMs) > 0) "Fortsæt" else "Afspil", { viewModel.playTitle() }, primary = true, icon = Icons.Rounded.PlayArrow)
                            V1Button("Fra begyndelsen", { viewModel.playTitle(true) }, icon = Icons.Rounded.Refresh)
                            V1Button(if (title.inWatchlist) "Fjern fra Min liste" else "Føj til Min liste", viewModel::toggleWatchlist, icon = if (title.inWatchlist) Icons.Rounded.Check else Icons.Rounded.Add)
                        }
                    }
                }
                if (title.seasons.isNotEmpty()) {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Sæsoner og afsnit", color = V1Colors.Text, fontSize = 19.sp, fontWeight = FontWeight.Black)
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                items(title.seasons, key = { it.number }) { season ->
                                    V1Button("Sæson ${season.number}", { selectedSeason = season.number }, primary = selectedSeason == season.number)
                                }
                            }
                            val episodes = title.seasons.firstOrNull { it.number == selectedSeason }?.episodes.orEmpty()
                            if (episodes.isEmpty()) ProductionEmptyState("Ingen afsnit fundet", "Serveren returnerede ingen afsnit for denne sæson.")
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(vertical = 5.dp)) {
                                items(episodes, key = { it.id }) { episode ->
                                    ProductionEpisodeCard(episode, viewModel)
                                }
                            }
                        }
                    }
                }
                if (title.people.isNotEmpty()) {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                            Text("Skuespillere og crew", color = V1Colors.Text, fontSize = 19.sp, fontWeight = FontWeight.Black)
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                items(title.people, key = { "${it.name}-${it.role}" }) { person ->
                                    V1GlassPanel(Modifier.width(142.dp).height(178.dp), radius = 18.dp) {
                                        Column(Modifier.fillMaxSize().padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                            AsyncImage(model = person.imageUrl?.let(viewModel.api::resolvePublicUrl), contentDescription = null, modifier = Modifier.size(100.dp).clip(CircleShape).background(V1Colors.Elevated), contentScale = ContentScale.Crop)
                                            Spacer(Modifier.height(8.dp))
                                            Text(person.name, color = V1Colors.Text, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                            Text(person.role, color = V1Colors.Muted, fontSize = 8.sp, maxLines = 1)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if (title.related.isNotEmpty()) {
                    item { ProductionMediaRow(ProductionRow("related", "Lignende titler", title.related, null), viewModel) }
                }
            }
        }
    }
}

@Composable
private fun ProductionEpisodeCard(episode: ProductionEpisode, viewModel: ProductionViewModel) {
    V1FocusSurface(
        onClick = { viewModel.playEpisode(episode) },
        onLongClick = { viewModel.playEpisode(episode, true) },
        modifier = Modifier.width(254.dp).height(174.dp),
        radius = 16.dp,
    ) { focused ->
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxWidth().height(112.dp).background(V1Colors.Elevated)) {
                AsyncImage(model = episode.artworkUrl?.let(viewModel.api::resolvePublicUrl), contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                if (episode.progress > 0f) {
                    Box(Modifier.fillMaxWidth().height(4.dp).align(Alignment.BottomCenter).background(V1Colors.Border)) {
                        Box(Modifier.fillMaxWidth(episode.progress).fillMaxHeight().background(V1Colors.Gold))
                    }
                }
                if (episode.watched) V1Pill("Set", Modifier.align(Alignment.TopEnd).padding(7.dp), V1Colors.Green, true)
            }
            Column(Modifier.padding(9.dp)) {
                Text("S${episode.seasonNumber} A${episode.episodeNumber} · ${episode.title}", color = if (focused) V1Colors.Gold else V1Colors.Text, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (episode.startPositionMs > 0) "Fortsæt fra ${formatTime(episode.startPositionMs)}" else "Klar til afspilning", color = V1Colors.Muted, fontSize = 8.sp)
            }
        }
    }
}

@Composable
private fun ProductionPinOverlay(
    profile: ProductionProfile,
    onSubmit: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var pin by remember(profile.id) { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.72f)), contentAlignment = Alignment.Center) {
        V1GlassPanel(Modifier.width(470.dp).height(520.dp)) {
            Column(Modifier.fillMaxSize().padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(15.dp)) {
                Text(profile.name, color = V1Colors.Text, fontSize = 27.sp, fontWeight = FontWeight.Black)
                Text("Indtast profil-PIN", color = V1Colors.Muted, fontSize = 12.sp)
                Text("●".repeat(pin.length) + "○".repeat((4 - pin.length).coerceAtLeast(0)), color = V1Colors.Gold, fontSize = 25.sp, letterSpacing = 7.sp)
                listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("Luk", "0", "Slet")).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { key ->
                            V1Button(
                                label = key,
                                onClick = {
                                    when (key) {
                                        "Luk" -> onDismiss()
                                        "Slet" -> if (pin.isNotEmpty()) pin = pin.dropLast(1)
                                        else -> if (pin.length < 4) {
                                            pin += key
                                            if (pin.length == 4) onSubmit(pin)
                                        }
                                    }
                                },
                                modifier = Modifier.width(105.dp),
                                primary = key == "0",
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductionMessage(message: String, onDismiss: () -> Unit) {
    V1GlassPanel(Modifier.width(560.dp), radius = 18.dp) {
        Row(Modifier.fillMaxWidth().padding(15.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(8.dp).background(V1Colors.Gold, CircleShape))
            Text(message, color = V1Colors.Text, fontSize = 11.sp, modifier = Modifier.weight(1f), maxLines = 2)
            V1Button("Luk", onDismiss, icon = Icons.Rounded.Close)
        }
    }
}

@Composable
internal fun ProductionConfirmOverlay(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.7f)), contentAlignment = Alignment.Center) {
        V1GlassPanel(Modifier.width(520.dp).height(240.dp)) {
            Column(Modifier.fillMaxSize().padding(30.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(title, color = V1Colors.Text, fontSize = 25.sp, fontWeight = FontWeight.Black)
                Text(message, color = V1Colors.Muted, fontSize = 12.sp, lineHeight = 18.sp)
                Spacer(Modifier.weight(1f))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    V1Button(confirmLabel, onConfirm, primary = true, icon = Icons.Rounded.Check)
                    V1Button("Annuller", onDismiss, icon = Icons.Rounded.Close)
                }
            }
        }
    }
}

@Composable
internal fun ProductionEmptyState(title: String, description: String) {
    V1GlassPanel(Modifier.fillMaxWidth().height(150.dp)) {
        Column(Modifier.fillMaxSize().padding(26.dp), verticalArrangement = Arrangement.Center) {
            Text(title, color = V1Colors.Text, fontSize = 18.sp, fontWeight = FontWeight.Black)
            Text(description, color = V1Colors.Muted, fontSize = 11.sp)
        }
    }
}

@Composable
internal fun ProductionInlineLoading(label: String) {
    V1GlassPanel(Modifier.fillMaxWidth().height(104.dp), radius = 18.dp) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CircularProgressIndicator(color = V1Colors.Gold, strokeWidth = 2.dp, modifier = Modifier.size(26.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(label, color = V1Colors.Text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Text("Du kan fortsat navigere imens.", color = V1Colors.Muted, fontSize = 9.sp)
            }
        }
    }
}

private fun qrBitmap(value: String, size: Int): Bitmap {
    val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, size, size)
    return Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).apply {
        for (y in 0 until size) for (x in 0 until size) {
            setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
    }
}

internal fun formatTime(milliseconds: Long): String {
    val seconds = (milliseconds / 1000L).coerceAtLeast(0L)
    val hours = seconds / 3600L
    val minutes = (seconds % 3600L) / 60L
    val remainder = seconds % 60L
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, remainder) else "%d:%02d".format(minutes, remainder)
}
