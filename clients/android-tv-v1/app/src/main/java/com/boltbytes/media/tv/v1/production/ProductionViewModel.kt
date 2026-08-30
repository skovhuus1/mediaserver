package com.boltbytes.media.tv.v1.production

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Deferred
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
    val seriesId: String? = null,
    val nextEpisodeId: String? = null,
    val nextEpisodeTitle: String? = null,
    val live: Boolean = false,
    val channelIds: List<String> = emptyList(),
    val channelIndex: Int = 0,
    val channelNames: List<String> = emptyList(),
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
    val loadingTitle: Boolean = false,
    val searching: Boolean = false,
    val loadingGenre: Boolean = false,
    val loadingGuide: Boolean = false,
    val loadingNotifications: Boolean = false,
    val loadingDownloads: Boolean = false,
) {
    val unreadCount: Int get() = notifications.count { !it.read }
}

class ProductionViewModel(application: Application) : AndroidViewModel(application) {
    private data class CachedContent<T>(val value: T, val loadedAt: Long)

    val api = ProductionApi(application)
    private val updateManager = ProductionUpdateManager(application)
    private val mutableState = MutableStateFlow(ProductionUiState())
    val state: StateFlow<ProductionUiState> = mutableState.asStateFlow()

    private val backStack = ArrayDeque<ProductionRoute>()
    private var generation = 0L
    private var qrJob: Job? = null
    private var liveRefreshJob: Job? = null
    private var titlePrefetchJob: Job? = null
    private var searchJob: Job? = null
    private var guideLoadJob: Job? = null
    private var notificationsLoadJob: Job? = null
    private var downloadsLoadJob: Job? = null
    private val titleCache = mutableMapOf<String, CachedContent<ProductionTitle>>()
    private val titleRequests = mutableMapOf<String, Deferred<ProductionTitle>>()
    private val genreCache = mutableMapOf<String, CachedContent<List<ProductionCard>>>()

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
        scheduleTitlePrefetch(card)
    }

    fun selectHubFilter(filter: String) {
        val selected = filteredCards(mutableState.value.home, filter).firstOrNull()
        mutableState.update { it.copy(hubFilter = filter, selectedHero = selected) }
        selected?.let(::scheduleTitlePrefetch)
    }

    fun openTitle(id: String) {
        navigate(ProductionRoute.Title(id))
        val cached = titleCache[id]
        mutableState.update { it.copy(title = cached?.value, loadingTitle = cached == null) }
        viewModelScope.launch {
            try {
                val loaded = loadTitleCached(id)
                if (mutableState.value.route == ProductionRoute.Title(id)) {
                    mutableState.update { it.copy(title = loaded, loadingTitle = false, message = null) }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (mutableState.value.route == ProductionRoute.Title(id)) {
                    mutableState.update { it.copy(loadingTitle = false, message = error.userMessage()) }
                }
            }
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
        val initialRequest = ProductionPlaybackRequest(
            mediaId = card.id,
            title = card.title,
            startPositionMs = if (fromBeginning) 0L else card.startPositionMs,
            seriesId = card.seriesId,
        )
        navigate(ProductionRoute.Player(initialRequest))
        val seriesId = card.seriesId ?: return
        viewModelScope.launch {
            runCatching { loadTitleCached(seriesId) }.onSuccess { title ->
                val episode = orderedEpisodes(title).firstOrNull { it.id == card.id } ?: return@onSuccess
                val hydratedRequest = episodePlaybackRequest(
                    title = title,
                    episode = episode,
                    startPositionMs = initialRequest.startPositionMs,
                )
                mutableState.update { current ->
                    val route = current.route as? ProductionRoute.Player
                    if (route?.request?.mediaId == card.id) {
                        current.copy(route = ProductionRoute.Player(hydratedRequest))
                    } else {
                        current
                    }
                }
            }
        }
    }

    fun playTitle(fromBeginning: Boolean = false) {
        val title = mutableState.value.title ?: return
        val episode = title.resumeEpisode ?: title.nextEpisode ?: title.seasons.firstOrNull()?.episodes?.firstOrNull()
        val mediaId = if (title.type.contains("series", true) || title.seasons.isNotEmpty()) episode?.id ?: return else title.id
        val label = episode?.let { "${title.title} · S${it.seasonNumber} A${it.episodeNumber}" } ?: title.title
        val request = if (episode != null) {
            episodePlaybackRequest(
                title = title,
                episode = episode,
                startPositionMs = if (fromBeginning) 0L else episode.startPositionMs,
            )
        } else {
            ProductionPlaybackRequest(
                mediaId = mediaId,
                title = label,
                startPositionMs = if (fromBeginning) 0L else title.startPositionMs,
            )
        }
        navigate(
            ProductionRoute.Player(request),
        )
    }

    fun playEpisode(episode: ProductionEpisode, fromBeginning: Boolean = false) {
        val title = mutableState.value.title
        val request = if (title != null) {
            episodePlaybackRequest(
                title = title,
                episode = episode,
                startPositionMs = if (fromBeginning) 0L else episode.startPositionMs,
            )
        } else {
            ProductionPlaybackRequest(
                mediaId = episode.id,
                title = episode.title,
                startPositionMs = if (fromBeginning) 0L else episode.startPositionMs,
            )
        }
        navigate(
            ProductionRoute.Player(request),
        )
    }

    private fun orderedEpisodes(title: ProductionTitle): List<ProductionEpisode> =
        title.seasons
            .sortedBy { it.number }
            .flatMap { season -> season.episodes.sortedBy { it.episodeNumber } }

    private fun episodePlaybackRequest(
        title: ProductionTitle,
        episode: ProductionEpisode,
        startPositionMs: Long,
    ): ProductionPlaybackRequest {
        val episodes = orderedEpisodes(title)
        val currentIndex = episodes.indexOfFirst { it.id == episode.id }
        val next = episodes.getOrNull(currentIndex + 1)
        return ProductionPlaybackRequest(
            mediaId = episode.id,
            title = "${title.title} · S${episode.seasonNumber} A${episode.episodeNumber}",
            startPositionMs = startPositionMs,
            seriesId = title.id,
            nextEpisodeId = next?.id,
            nextEpisodeTitle = next?.let { "${title.title} · S${it.seasonNumber} A${it.episodeNumber}" },
        )
    }

    fun playerEnded(request: ProductionPlaybackRequest) {
        val autoplay = mutableState.value.preferences.autoplay
        val nextEpisodeId = request.nextEpisodeId
        if (!autoplay || nextEpisodeId.isNullOrBlank()) {
            closePlayer()
            return
        }
        viewModelScope.launch {
            val chainedRequest = request.seriesId?.let { seriesId ->
                runCatching { loadTitleCached(seriesId) }.getOrNull()?.let { title ->
                    orderedEpisodes(title).firstOrNull { it.id == nextEpisodeId }?.let { episode ->
                        episodePlaybackRequest(title, episode, 0L)
                    }
                }
            } ?: request.copy(
                mediaId = nextEpisodeId,
                title = request.nextEpisodeTitle ?: "Næste afsnit",
                startPositionMs = 0L,
                nextEpisodeId = null,
                nextEpisodeTitle = null,
            )
            mutableState.update { current ->
                val route = current.route as? ProductionRoute.Player
                if (route?.request?.mediaId == request.mediaId) {
                    current.copy(route = ProductionRoute.Player(chainedRequest))
                } else {
                    current
                }
            }
        }
    }

    fun closePlayer() {
        backInternal()
        refreshHomeSilently()
        val titleRoute = mutableState.value.route as? ProductionRoute.Title
        if (titleRoute != null) {
            viewModelScope.launch {
                runCatching { loadTitleCached(titleRoute.id, forceRefresh = true) }.onSuccess { updated ->
                    if (mutableState.value.route == titleRoute) {
                        mutableState.update { it.copy(title = updated) }
                    }
                }
            }
        }
    }

    fun openSearch() {
        navigate(ProductionRoute.Search)
    }

    fun search(query: String) {
        searchJob?.cancel()
        if (query.trim().length < 2) {
            mutableState.update { it.copy(searchQuery = query, searchResults = emptyList(), searching = false) }
            return
        }
        mutableState.update { it.copy(searchQuery = query, searching = true) }
        searchJob = viewModelScope.launch {
            delay(250L)
            if (mutableState.value.searchQuery != query) return@launch
            try {
                val result = api.search(query.trim())
                if (mutableState.value.searchQuery == query) {
                    mutableState.update { it.copy(searchResults = result, searching = false, message = null) }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (mutableState.value.searchQuery == query) {
                    mutableState.update { it.copy(searching = false, message = error.userMessage()) }
                }
            }
        }
    }

    fun openGenre() {
        navigate(ProductionRoute.Genre)
        mutableState.update { it.copy(selectedGenre = null, genreResults = emptyList(), loadingGenre = false) }
    }

    fun selectGenre(genre: String) {
        val cached = genreCache[genre]
        mutableState.update {
            it.copy(
                selectedGenre = genre,
                genreResults = cached?.value.orEmpty(),
                loadingGenre = cached == null,
            )
        }
        if (cached?.isFresh() == true) return
        viewModelScope.launch {
            runCatching { api.search(genre) }
                .onSuccess { result ->
                    genreCache[genre] = CachedContent(result, System.currentTimeMillis())
                    if (mutableState.value.selectedGenre == genre) {
                        mutableState.update { it.copy(genreResults = result, loadingGenre = false, message = null) }
                    }
                }
                .onFailure { error ->
                    if (mutableState.value.selectedGenre == genre) {
                        mutableState.update { it.copy(loadingGenre = false, message = error.userMessage()) }
                    }
                }
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
                    channelNames = channels.map { it.name },
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

    fun resumePendingUpdateInstall() {
        updateManager.resumePendingInstall()
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
        if (guideLoadJob?.isActive == true) return
        mutableState.update { it.copy(loadingGuide = it.channels.isEmpty()) }
        guideLoadJob = viewModelScope.launch {
            runCatching { api.guide() }
                .onSuccess { channels -> mutableState.update { it.copy(channels = channels, loadingGuide = false, message = null) } }
                .onFailure { error -> mutableState.update { it.copy(loadingGuide = false, message = error.userMessage()) } }
        }
    }

    private fun loadNotifications() {
        if (notificationsLoadJob?.isActive == true) return
        mutableState.update { it.copy(loadingNotifications = it.notifications.isEmpty()) }
        notificationsLoadJob = viewModelScope.launch {
            runCatching { api.notifications() }
                .onSuccess { notifications -> mutableState.update { it.copy(notifications = notifications, loadingNotifications = false, message = null) } }
                .onFailure { error -> mutableState.update { it.copy(loadingNotifications = false, message = error.userMessage()) } }
        }
    }

    private fun loadDownloads() {
        if (downloadsLoadJob?.isActive == true) return
        mutableState.update { it.copy(loadingDownloads = it.downloads.isEmpty()) }
        downloadsLoadJob = viewModelScope.launch {
            runCatching { api.downloads() }
                .onSuccess { downloads -> mutableState.update { it.copy(downloads = downloads, loadingDownloads = false, message = null) } }
                .onFailure { error -> mutableState.update { it.copy(loadingDownloads = false, message = error.userMessage()) } }
        }
    }

    private fun scheduleTitlePrefetch(card: ProductionCard) {
        val id = card.seriesId ?: card.id
        if (id.isBlank() || titleCache[id]?.isFresh() == true) return
        titlePrefetchJob?.cancel()
        titlePrefetchJob = viewModelScope.launch {
            delay(180L)
            runCatching { loadTitleCached(id) }
        }
    }

    private suspend fun loadTitleCached(id: String, forceRefresh: Boolean = false): ProductionTitle {
        val cached = titleCache[id]
        if (!forceRefresh && cached?.isFresh() == true) return cached.value
        val existing = titleRequests[id]
        val request = existing ?: viewModelScope.async { api.title(id) }.also { deferred ->
            titleRequests[id] = deferred
            deferred.invokeOnCompletion {
                viewModelScope.launch {
                    if (titleRequests[id] === deferred) titleRequests.remove(id)
                }
            }
        }
        return request.await().also { loaded ->
            titleCache[id] = CachedContent(loaded, System.currentTimeMillis())
            if (titleCache.size > 64) titleCache.remove(titleCache.keys.first())
        }
    }

    private fun <T> CachedContent<T>.isFresh(): Boolean =
        System.currentTimeMillis() - loadedAt < CONTENT_CACHE_TTL_MS

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

    private companion object {
        const val CONTENT_CACHE_TTL_MS = 5 * 60 * 1_000L
    }
}
