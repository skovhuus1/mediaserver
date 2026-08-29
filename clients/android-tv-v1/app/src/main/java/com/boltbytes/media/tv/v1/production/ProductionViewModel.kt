package com.boltbytes.media.tv.v1.production

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

sealed interface ProductionRoute {
    data object Boot : ProductionRoute
    data object Login : ProductionRoute
    data object Profiles : ProductionRoute
    data object Hub : ProductionRoute
    data object Search : ProductionRoute
    data object Genre : ProductionRoute
    data object LiveTv : ProductionRoute
    data object Downloads : ProductionRoute
    data object Notifications : ProductionRoute
    data object Settings : ProductionRoute
    data class Title(val id: String) : ProductionRoute
    data class Player(val request: ProductionPlaybackRequest) : ProductionRoute
}

data class ProductionPlaybackRequest(
    val mediaId: String,
    val title: String,
    val startPositionMs: Long = 0L,
    val nextEpisodeId: String? = null,
    val nextEpisodeTitle: String? = null,
    val live: Boolean = false,
    val channelIds: List<String> = emptyList(),
    val channelIndex: Int = 0,
)

data class ProductionUiState(
    val route: ProductionRoute = ProductionRoute.Boot,
    val busy: Boolean = true,
    val message: String? = null,
    val profiles: List<ProductionProfile> = emptyList(),
    val activeProfile: ProductionProfile? = null,
    val home: ProductionHome = ProductionHome(null, emptyList()),
    val selectedHero: ProductionCard? = null,
    val hubFilter: String = "home",
    val title: ProductionTitle? = null,
    val searchQuery: String = "",
    val searchResults: List<ProductionCard> = emptyList(),
    val selectedGenre: String? = null,
    val genreResults: List<ProductionCard> = emptyList(),
    val channels: List<ProductionChannel> = emptyList(),
    val notifications: List<ProductionNotification> = emptyList(),
    val downloads: List<ProductionDownload> = emptyList(),
    val preferences: ProductionPreferences = ProductionPreferences(),
    val qr: ProductionQrChallenge? = null,
    val contextCard: ProductionCard? = null,
    val confirmExit: Boolean = false,
    val updateState: ProductionUpdateState = ProductionUpdateState.Idle,
) {
    val unreadCount: Int get() = notifications.count { !it.read }
}

class ProductionViewModel(application: Application) : AndroidViewModel(application) {
    val api = ProductionApi(application)
    private val updateManager = ProductionUpdateManager(application)
    private val mutableState = MutableStateFlow(ProductionUiState())
    val state: StateFlow<ProductionUiState> = mutableState.asStateFlow()

    private val backStack = ArrayDeque<ProductionRoute>()
    private var generation = 0L
    private var qrJob: Job? = null
    private var liveRefreshJob: Job? = null

    init {
        viewModelScope.launch {
            updateManager.state.collect { update -> mutableState.update { it.copy(updateState = update) } }
        }
        bootstrap()
    }

    fun bootstrap() {
        val currentGeneration = ++generation
        qrJob?.cancel()
        mutableState.update { it.copy(route = ProductionRoute.Boot, busy = true, message = null) }
        viewModelScope.launch {
            try {
                val account = withTimeout(8_000L) {
                    if (api.restore()) api.me() else null
                }
                if (currentGeneration != generation) return@launch
                if (account == null) {
                    mutableState.update { it.copy(route = ProductionRoute.Login, busy = false) }
                    startQr()
                    return@launch
                }
                installAccount(account, currentGeneration)
            } catch (error: Exception) {
                if (error is CancellationException || currentGeneration != generation) return@launch
                mutableState.update {
                    it.copy(
                        route = ProductionRoute.Login,
                        busy = false,
                        message = "Serveren kunne ikke kontaktes. Du kan prøve igen eller logge ind.",
                    )
                }
                startQr()
            }
        }
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            mutableState.update { it.copy(message = "Indtast email og adgangskode") }
            return
        }
        val currentGeneration = ++generation
        qrJob?.cancel()
        launchBusy {
            val response = api.login(email, password)
            installAccount(if (parseProfiles(response).isEmpty()) api.me() else response, currentGeneration)
        }
    }

    fun startQr() {
        qrJob?.cancel()
        qrJob = viewModelScope.launch {
            try {
                val challenge = api.startQr()
                mutableState.update { it.copy(qr = challenge, message = null) }
                while (true) {
                    delay(challenge.pollIntervalSeconds * 1_000L)
                    if (api.pollQr(challenge)) {
                        val currentGeneration = ++generation
                        installAccount(api.me(), currentGeneration)
                        return@launch
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                mutableState.update { it.copy(qr = null, message = error.userMessage()) }
            }
        }
    }

    fun selectProfile(profile: ProductionProfile, pin: String?) {
        val currentGeneration = ++generation
        launchBusy {
            api.selectProfile(profile.id, pin)
            if (currentGeneration != generation) return@launchBusy
            mutableState.update { it.copy(activeProfile = profile, route = ProductionRoute.Hub) }
            backStack.clear()
            loadProfileSurface()
        }
    }

    fun selectHero(card: ProductionCard) {
        mutableState.update { it.copy(selectedHero = card) }
    }

    fun selectHubFilter(filter: String) {
        mutableState.update { it.copy(hubFilter = filter, selectedHero = filteredCards(it.home, filter).firstOrNull()) }
    }

    fun openTitle(id: String) {
        navigate(ProductionRoute.Title(id))
        launchBusy {
            mutableState.update { it.copy(title = api.title(id)) }
        }
    }

    fun openCard(card: ProductionCard) {
        openTitle(card.seriesId ?: card.id)
    }

    fun showContext(card: ProductionCard) {
        mutableState.update { it.copy(contextCard = card) }
    }

    fun closeContext() {
        mutableState.update { it.copy(contextCard = null) }
    }

    fun playCard(card: ProductionCard, fromBeginning: Boolean = false) {
        closeContext()
        navigate(
            ProductionRoute.Player(
                ProductionPlaybackRequest(
                    mediaId = card.id,
                    title = card.title,
                    startPositionMs = if (fromBeginning) 0L else card.startPositionMs,
                ),
            ),
        )
    }

    fun playTitle(fromBeginning: Boolean = false) {
        val title = mutableState.value.title ?: return
        val episode = title.resumeEpisode ?: title.nextEpisode ?: title.seasons.firstOrNull()?.episodes?.firstOrNull()
        val mediaId = if (title.type.contains("series", true) || title.seasons.isNotEmpty()) episode?.id ?: return else title.id
        val label = episode?.let { "${title.title} · S${it.seasonNumber} A${it.episodeNumber}" } ?: title.title
        navigate(
            ProductionRoute.Player(
                ProductionPlaybackRequest(
                    mediaId = mediaId,
                    title = label,
                    startPositionMs = if (fromBeginning) 0L else episode?.startPositionMs ?: title.startPositionMs,
                    nextEpisodeId = title.nextEpisode?.id?.takeIf { it != mediaId },
                    nextEpisodeTitle = title.nextEpisode?.title,
                ),
            ),
        )
    }

    fun playEpisode(episode: ProductionEpisode, fromBeginning: Boolean = false) {
        val title = mutableState.value.title
        val allEpisodes = title?.seasons.orEmpty().flatMap { it.episodes }
        val index = allEpisodes.indexOfFirst { it.id == episode.id }
        val next = allEpisodes.getOrNull(index + 1)
        navigate(
            ProductionRoute.Player(
                ProductionPlaybackRequest(
                    mediaId = episode.id,
                    title = "${title?.title ?: episode.title} · S${episode.seasonNumber} A${episode.episodeNumber}",
                    startPositionMs = if (fromBeginning) 0L else episode.startPositionMs,
                    nextEpisodeId = next?.id,
                    nextEpisodeTitle = next?.title,
                ),
            ),
        )
    }

    fun playerEnded(request: ProductionPlaybackRequest) {
        val autoplay = mutableState.value.preferences.autoplay
        if (autoplay && request.nextEpisodeId != null) {
            mutableState.update {
                it.copy(
                    route = ProductionRoute.Player(
                        request.copy(
                            mediaId = request.nextEpisodeId,
                            title = request.nextEpisodeTitle ?: "Næste afsnit",
                            startPositionMs = 0L,
                            nextEpisodeId = null,
                            nextEpisodeTitle = null,
                        ),
                    ),
                )
            }
        } else {
            closePlayer()
        }
    }

    fun closePlayer() {
        backInternal()
        refreshHomeSilently()
        val titleRoute = mutableState.value.route as? ProductionRoute.Title
        if (titleRoute != null) {
            viewModelScope.launch {
                runCatching { api.title(titleRoute.id) }.onSuccess { updated ->
                    mutableState.update { it.copy(title = updated) }
                }
            }
        }
    }

    fun openSearch() {
        navigate(ProductionRoute.Search)
    }

    fun search(query: String) {
        mutableState.update { it.copy(searchQuery = query) }
        if (query.trim().length < 2) {
            mutableState.update { it.copy(searchResults = emptyList()) }
            return
        }
        viewModelScope.launch {
            delay(250L)
            if (mutableState.value.searchQuery != query) return@launch
            runCatching { api.search(query.trim()) }
                .onSuccess { result -> mutableState.update { it.copy(searchResults = result, message = null) } }
                .onFailure { error -> mutableState.update { it.copy(message = error.userMessage()) } }
        }
    }

    fun openGenre() {
        navigate(ProductionRoute.Genre)
        mutableState.update { it.copy(selectedGenre = null, genreResults = emptyList()) }
    }

    fun selectGenre(genre: String) {
        mutableState.update { it.copy(selectedGenre = genre, busy = true) }
        viewModelScope.launch {
            runCatching { api.search(genre) }
                .onSuccess { result -> mutableState.update { it.copy(genreResults = result, busy = false, message = null) } }
                .onFailure { error -> mutableState.update { it.copy(busy = false, message = error.userMessage()) } }
        }
    }

    fun openLiveTv() {
        navigate(ProductionRoute.LiveTv)
        loadGuide()
        liveRefreshJob?.cancel()
        liveRefreshJob = viewModelScope.launch {
            while (true) {
                delay(60_000L)
                if (mutableState.value.route != ProductionRoute.LiveTv) return@launch
                runCatching { api.guide() }.onSuccess { channels -> mutableState.update { it.copy(channels = channels) } }
            }
        }
    }

    fun playChannel(channel: ProductionChannel) {
        val channels = mutableState.value.channels
        navigate(
            ProductionRoute.Player(
                ProductionPlaybackRequest(
                    mediaId = channel.id,
                    title = channel.name,
                    live = true,
                    channelIds = channels.map { it.id },
                    channelIndex = channels.indexOfFirst { it.id == channel.id }.coerceAtLeast(0),
                ),
            ),
        )
    }

    fun toggleFavorite(channel: ProductionChannel) {
        viewModelScope.launch {
            runCatching { api.setFavorite(channel.id, !channel.favorite) }
                .onSuccess { loadGuide() }
                .onFailure { error -> mutableState.update { it.copy(message = error.userMessage()) } }
        }
    }

    fun openNotifications() {
        navigate(ProductionRoute.Notifications)
        loadNotifications()
    }

    fun markRead(notification: ProductionNotification) {
        viewModelScope.launch {
            runCatching { api.markNotificationRead(notification.id) }.onSuccess {
                mutableState.update { state ->
                    state.copy(notifications = state.notifications.map { if (it.id == notification.id) it.copy(read = true) else it })
                }
            }.onFailure { error -> mutableState.update { it.copy(message = error.userMessage()) } }
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            runCatching { api.markAllNotificationsRead() }.onSuccess {
                mutableState.update { state -> state.copy(notifications = state.notifications.map { it.copy(read = true) }) }
            }.onFailure { error -> mutableState.update { it.copy(message = error.userMessage()) } }
        }
    }

    fun openDownloads() {
        navigate(ProductionRoute.Downloads)
        loadDownloads()
    }

    fun renewDownload(download: ProductionDownload) {
        viewModelScope.launch {
            runCatching { api.renewDownload(download.id) }.onSuccess { loadDownloads() }
                .onFailure { error -> mutableState.update { it.copy(message = error.userMessage()) } }
        }
    }

    fun removeDownload(download: ProductionDownload) {
        viewModelScope.launch {
            runCatching { api.removeDownload(download.id) }.onSuccess { loadDownloads() }
                .onFailure { error -> mutableState.update { it.copy(message = error.userMessage()) } }
        }
    }

    fun openSettings() {
        navigate(ProductionRoute.Settings)
        viewModelScope.launch {
            runCatching { api.preferences() }
                .onSuccess { value -> mutableState.update { it.copy(preferences = value) } }
                .onFailure { error -> mutableState.update { it.copy(message = error.userMessage()) } }
        }
    }

    fun updatePreferences(value: ProductionPreferences) {
        mutableState.update { it.copy(preferences = value) }
    }

    fun savePreferences() {
        val value = mutableState.value.preferences
        launchBusy {
            api.savePreferences(value)
            mutableState.update { it.copy(message = "Indstillingerne er gemt") }
        }
    }

    fun checkForUpdate() {
        viewModelScope.launch { updateManager.check() }
    }

    fun downloadUpdate() {
        viewModelScope.launch { updateManager.download() }
    }

    fun installUpdate() {
        updateManager.install()
    }

    fun toggleWatchlist() {
        val title = mutableState.value.title ?: return
        viewModelScope.launch {
            runCatching {
                if (title.inWatchlist) api.removeWatchlist(title.id) else api.addWatchlist(title.id, title.type)
            }.onSuccess {
                mutableState.update { it.copy(title = title.copy(inWatchlist = !title.inWatchlist)) }
            }.onFailure { error -> mutableState.update { it.copy(message = error.userMessage()) } }
        }
    }

    fun contextWatchlist(card: ProductionCard) {
        viewModelScope.launch {
            runCatching { api.addWatchlist(card.id, card.type) }
                .onSuccess { mutableState.update { it.copy(contextCard = null, message = "Tilføjet til Min liste") } }
                .onFailure { error -> mutableState.update { it.copy(contextCard = null, message = error.userMessage()) } }
        }
    }

    fun contextRemoveContinue(card: ProductionCard) {
        viewModelScope.launch {
            runCatching { api.removeContinue(card.id) }
                .onSuccess { mutableState.update { it.copy(contextCard = null) }; refreshHomeSilently() }
                .onFailure { error -> mutableState.update { it.copy(contextCard = null, message = error.userMessage()) } }
        }
    }

    fun contextSetWatched(card: ProductionCard) {
        viewModelScope.launch {
            runCatching { api.setWatched(card.id, true) }
                .onSuccess { mutableState.update { it.copy(contextCard = null, message = "Markeret som set") }; refreshHomeSilently() }
                .onFailure { error -> mutableState.update { it.copy(contextCard = null, message = error.userMessage()) } }
        }
    }

    fun openProfiles() {
        navigate(ProductionRoute.Profiles)
    }

    fun back() {
        when {
            mutableState.value.contextCard != null -> closeContext()
            mutableState.value.route == ProductionRoute.Hub -> mutableState.update { it.copy(confirmExit = true) }
            mutableState.value.route == ProductionRoute.Login -> mutableState.update { it.copy(confirmExit = true) }
            else -> backInternal()
        }
    }

    fun dismissExit() {
        mutableState.update { it.copy(confirmExit = false) }
    }

    fun clearMessage() {
        mutableState.update { it.copy(message = null) }
    }

    fun logout() {
        ++generation
        qrJob?.cancel()
        liveRefreshJob?.cancel()
        viewModelScope.launch {
            runCatching { api.logout() }
            backStack.clear()
            mutableState.value = ProductionUiState(route = ProductionRoute.Login, busy = false)
            startQr()
        }
    }

    private suspend fun installAccount(response: org.json.JSONObject, expectedGeneration: Long) {
        val profiles = parseProfiles(response).ifEmpty { parseProfiles(api.me()) }
        if (expectedGeneration != generation) return
        mutableState.update { it.copy(route = ProductionRoute.Profiles, profiles = profiles, busy = false, message = null) }
        backStack.clear()
    }

    private suspend fun loadProfileSurface() = coroutineScope {
        val home = async { api.home() }
        val preferences = async { runCatching { api.preferences() }.getOrDefault(ProductionPreferences()) }
        val notifications = async { runCatching { api.notifications() }.getOrDefault(emptyList()) }
        val loadedHome = home.await()
        val loadedPreferences = preferences.await()
        val loadedNotifications = notifications.await()
        mutableState.update {
            it.copy(
                home = loadedHome,
                selectedHero = loadedHome.hero,
                preferences = loadedPreferences,
                notifications = loadedNotifications,
                busy = false,
                message = null,
            )
        }
    }

    private fun loadGuide() {
        launchBusy {
            mutableState.update { it.copy(channels = api.guide()) }
        }
    }

    private fun loadNotifications() {
        launchBusy { mutableState.update { it.copy(notifications = api.notifications()) } }
    }

    private fun loadDownloads() {
        launchBusy { mutableState.update { it.copy(downloads = api.downloads()) } }
    }

    private fun refreshHomeSilently() {
        viewModelScope.launch {
            runCatching { api.home() }.onSuccess { home ->
                mutableState.update { it.copy(home = home, selectedHero = it.selectedHero ?: home.hero) }
            }
        }
    }

    private fun navigate(route: ProductionRoute) {
        val current = mutableState.value.route
        if (current != route) backStack.addLast(current)
        mutableState.update { it.copy(route = route, busy = false, message = null, confirmExit = false) }
    }

    private fun backInternal() {
        liveRefreshJob?.cancel()
        val previous = if (backStack.isNotEmpty()) backStack.removeLast() else ProductionRoute.Hub
        mutableState.update { it.copy(route = previous, busy = false, message = null, confirmExit = false) }
    }

    private fun launchBusy(block: suspend () -> Unit) {
        mutableState.update { it.copy(busy = true, message = null) }
        viewModelScope.launch {
            try {
                block()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                mutableState.update { it.copy(message = error.userMessage()) }
            } finally {
                mutableState.update { it.copy(busy = false) }
            }
        }
    }

    private fun filteredCards(home: ProductionHome, filter: String): List<ProductionCard> =
        home.rows.flatMap { it.cards }.filter { card ->
            when (filter) {
                "movies" -> card.type.contains("movie", true) || card.type.contains("film", true)
                "series" -> card.type.contains("series", true) || card.type.contains("episode", true)
                "continue" -> card.progress > 0f && card.progress < 0.95f
                else -> true
            }
        }

    private fun Throwable.userMessage(): String = message?.takeIf { it.isNotBlank() } ?: "Der opstod en ukendt fejl"
}
