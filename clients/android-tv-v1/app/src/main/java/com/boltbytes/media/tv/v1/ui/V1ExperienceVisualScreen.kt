package com.boltbytes.media.tv.v1.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

private enum class V1VisualRoute {
    Login,
    Profiles,
    Hub,
    Movies,
    Series,
    Search,
    Genres,
    Downloads,
    Title,
    Player,
    LiveTv,
    Notifications,
    Settings,
}

@Composable
fun V1ExperienceVisualScreen(
    startOnHub: Boolean = false,
    previewRoute: String? = null,
) {
    var route by remember {
        mutableStateOf(
            when (previewRoute?.lowercase()) {
                "profiles" -> V1VisualRoute.Profiles
                "hub" -> V1VisualRoute.Hub
                "movies" -> V1VisualRoute.Movies
                "series" -> V1VisualRoute.Series
                "search" -> V1VisualRoute.Search
                "genres", "genre" -> V1VisualRoute.Genres
                "downloads" -> V1VisualRoute.Downloads
                "title" -> V1VisualRoute.Title
                "player" -> V1VisualRoute.Player
                "live-tv" -> V1VisualRoute.LiveTv
                "notifications" -> V1VisualRoute.Notifications
                "settings" -> V1VisualRoute.Settings
                else -> if (startOnHub) V1VisualRoute.Hub else V1VisualRoute.Login
            },
        )
    }
    var titleReturnRoute by remember { mutableStateOf(V1VisualRoute.Hub) }
    var playerReturnRoute by remember { mutableStateOf(V1VisualRoute.Title) }
    var selectedEpisodeIndex by remember { androidx.compose.runtime.mutableIntStateOf(3) }
    var restoreEpisodeFocus by remember { mutableStateOf(false) }

    BackHandler(enabled = route != V1VisualRoute.Login) {
        route = when (route) {
            V1VisualRoute.Player -> {
                restoreEpisodeFocus = playerReturnRoute == V1VisualRoute.Title
                playerReturnRoute
            }
            V1VisualRoute.Title -> titleReturnRoute
            V1VisualRoute.Search,
            V1VisualRoute.Genres,
            V1VisualRoute.Downloads,
            V1VisualRoute.LiveTv,
            V1VisualRoute.Movies,
            V1VisualRoute.Series,
            V1VisualRoute.Notifications,
            V1VisualRoute.Settings,
            -> V1VisualRoute.Hub
            V1VisualRoute.Hub -> V1VisualRoute.Profiles
            V1VisualRoute.Profiles -> V1VisualRoute.Login
            V1VisualRoute.Login -> V1VisualRoute.Login
        }
    }

    AnimatedContent(
        targetState = route,
        transitionSpec = {
            (fadeIn(tween(190)) + scaleIn(initialScale = 0.992f, animationSpec = tween(220)))
                .togetherWith(fadeOut(tween(120)))
        },
        label = "v1-screen-transition",
    ) { activeRoute ->
        when (activeRoute) {
            V1VisualRoute.Login -> LoginVisualScreen(
                onOpenHub = { route = V1VisualRoute.Profiles },
            )
            V1VisualRoute.Profiles -> ProfileVisualScreen(
                onSelectProfile = { route = V1VisualRoute.Hub },
                onBack = { route = V1VisualRoute.Login },
            )
            V1VisualRoute.Hub -> HubVisualScreen(
                onLogout = { route = V1VisualRoute.Login },
                onOpenTitle = {
                    titleReturnRoute = V1VisualRoute.Hub
                    route = V1VisualRoute.Title
                },
                onOpenPlayer = {
                    playerReturnRoute = V1VisualRoute.Hub
                    route = V1VisualRoute.Player
                },
                onOpenMovies = { route = V1VisualRoute.Movies },
                onOpenSeries = { route = V1VisualRoute.Series },
                onOpenLiveTv = { route = V1VisualRoute.LiveTv },
                onOpenSearch = { route = V1VisualRoute.Search },
                onOpenGenres = { route = V1VisualRoute.Genres },
                onOpenDownloads = { route = V1VisualRoute.Downloads },
                onOpenProfile = { route = V1VisualRoute.Profiles },
                onOpenNotifications = { route = V1VisualRoute.Notifications },
                onOpenSettings = { route = V1VisualRoute.Settings },
            )
            V1VisualRoute.Movies -> CatalogVisualScreen(
                mode = V1CatalogMode.Movies,
                onBack = { route = V1VisualRoute.Hub },
                onOpenTitle = {
                    titleReturnRoute = V1VisualRoute.Movies
                    route = V1VisualRoute.Title
                },
                onPlay = {
                    playerReturnRoute = V1VisualRoute.Movies
                    route = V1VisualRoute.Player
                },
            )
            V1VisualRoute.Series -> CatalogVisualScreen(
                mode = V1CatalogMode.Series,
                onBack = { route = V1VisualRoute.Hub },
                onOpenTitle = {
                    titleReturnRoute = V1VisualRoute.Series
                    route = V1VisualRoute.Title
                },
                onPlay = {
                    playerReturnRoute = V1VisualRoute.Series
                    route = V1VisualRoute.Player
                },
            )
            V1VisualRoute.Search -> SearchVisualScreen(
                onBack = { route = V1VisualRoute.Hub },
                onOpenTitle = {
                    titleReturnRoute = V1VisualRoute.Search
                    route = V1VisualRoute.Title
                },
                onPlay = {
                    playerReturnRoute = V1VisualRoute.Search
                    route = V1VisualRoute.Player
                },
            )
            V1VisualRoute.Genres -> GenreVisualScreen(
                onBack = { route = V1VisualRoute.Hub },
                onOpenMovies = { route = V1VisualRoute.Movies },
                onOpenSeries = { route = V1VisualRoute.Series },
            )
            V1VisualRoute.Downloads -> DownloadsVisualScreen(
                onBack = { route = V1VisualRoute.Hub },
                onPlay = {
                    playerReturnRoute = V1VisualRoute.Downloads
                    route = V1VisualRoute.Player
                },
            )
            V1VisualRoute.Title -> TitleVisualScreen(
                onBack = { route = titleReturnRoute },
                onPlay = {
                    selectedEpisodeIndex = 0
                    playerReturnRoute = V1VisualRoute.Title
                    restoreEpisodeFocus = false
                    route = V1VisualRoute.Player
                },
                selectedEpisodeIndex = selectedEpisodeIndex,
                restoreEpisodeFocus = restoreEpisodeFocus,
                onEpisodeFocused = { selectedEpisodeIndex = it },
                onPlayEpisode = {
                    selectedEpisodeIndex = it
                    playerReturnRoute = V1VisualRoute.Title
                    restoreEpisodeFocus = false
                    route = V1VisualRoute.Player
                },
            )
            V1VisualRoute.Player -> PlayerVisualScreen(
                onBack = {
                    restoreEpisodeFocus = playerReturnRoute == V1VisualRoute.Title
                    route = playerReturnRoute
                },
                episodeIndex = selectedEpisodeIndex,
                previewMode = previewRoute?.lowercase() == "player",
            )
            V1VisualRoute.LiveTv -> LiveTvVisualScreen(
                onBack = { route = V1VisualRoute.Hub },
                onPlay = {
                    playerReturnRoute = V1VisualRoute.LiveTv
                    route = V1VisualRoute.Player
                },
            )
            V1VisualRoute.Notifications -> NotificationVisualScreen(
                onBack = { route = V1VisualRoute.Hub },
                onOpenTitle = {
                    titleReturnRoute = V1VisualRoute.Notifications
                    route = V1VisualRoute.Title
                },
            )
            V1VisualRoute.Settings -> SettingsVisualScreen(
                onBack = { route = V1VisualRoute.Hub },
            )
        }
    }
}
