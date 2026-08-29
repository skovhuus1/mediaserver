package com.boltbytes.media.tv.v1.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.boltbytes.media.tv.v1.core.TvHomePayload
import com.boltbytes.media.tv.v1.core.TvMediaCard
import com.boltbytes.media.tv.v1.core.TvPlaybackItem
import com.boltbytes.media.tv.v1.core.TvProfile
import com.boltbytes.media.tv.v1.core.TvQrPairing
import com.boltbytes.media.tv.v1.core.TvRepository
import com.boltbytes.media.tv.v1.core.TvTitleDetail
import com.boltbytes.media.tv.v1.core.TvUser
import com.boltbytes.media.tv.v1.playback.Media3PlaybackController
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

enum class TvRoute {
    Boot,
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

data class TvAppState(
    val route: TvRoute = TvRoute.Boot,
    val busy: Boolean = false,
    val error: String? = null,
    val user: TvUser? = null,
    val qr: TvQrPairing? = null,
    val home: TvHomePayload? = null,
    val title: TvTitleDetail? = null,
    val selectedCard: TvMediaCard? = null,
    val selectedEpisodeId: String? = null,
)

class TvAppViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = TvRepository(application)
    private val generation = AtomicInteger(0)
    private val _state = MutableStateFlow(TvAppState())
    val state: StateFlow<TvAppState> = _state.asStateFlow()
    private var qrJob: Job? = null
    private var playerReturnRoute = TvRoute.Hub
    private var queue: List<TvPlaybackItem> = emptyList()
    private var queueIndex = -1
    val playback = Media3PlaybackController(application, repository, viewModelScope, ::playNextAfterEnd)

    init {
        bootstrap()
    }

    fun bootstrap() {
        val run = generation.incrementAndGet()
        qrJob?.cancel()
        viewModelScope.launch {
            _state.value = TvAppState(route = TvRoute.Boot, busy = true)
            val result = runCatching { withTimeout(8_000) { repository.restore() } }
            if (generation.get() != run) return@launch
            result.onSuccess { user ->
                _state.value = TvAppState(route = TvRoute.Profiles, user = user)
            }.onFailure { error ->
                _state.value = TvAppState(route = TvRoute.Login, error = error.message?.takeUnless { it.contains("Sessionen findes ikke") })
                startQr()
            }
        }
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.length < 8) {
            _state.update { it.copy(error = "Indtast en gyldig email og adgangskode") }
            return
        }
        val run = generation.incrementAndGet()
        qrJob?.cancel()
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null) }
            runCatching { repository.login(email, password) }
                .onSuccess { user ->
                    if (generation.get() == run) _state.value = TvAppState(route = TvRoute.Profiles, user = user)
                }
                .onFailure { error ->
                    if (generation.get() == run) {
                        _state.update { it.copy(route = TvRoute.Login, busy = false, error = error.message) }
                        startQr()
                    }
                }
        }
    }

    fun startQr() {
        qrJob?.cancel()
        val run = generation.get()
        qrJob = viewModelScope.launch {
            runCatching { repository.startQr() }
                .onFailure { error -> if (generation.get() == run) _state.update { it.copy(error = error.message) } }
                .onSuccess { pairing ->
                    if (generation.get() != run || _state.value.route != TvRoute.Login) return@onSuccess
                    _state.update { it.copy(qr = pairing) }
                    while (generation.get() == run && _state.value.route == TvRoute.Login) {
                        delay(pairing.pollIntervalSeconds.coerceAtLeast(2) * 1_000)
                        val result = runCatching { repository.pollQr(pairing) }.getOrNull() ?: continue
                        when (result.first) {
                            "approved" -> {
                                result.second?.let { user -> _state.value = TvAppState(route = TvRoute.Profiles, user = user) }
                                return@launch
                            }
                            "expired", "consumed" -> {
                                _state.update { it.copy(qr = null, error = "QR-koden er udløbet. Generér en ny kode.") }
                                return@launch
                            }
                        }
                    }
                }
        }
    }

    fun selectProfile(profile: TvProfile, pin: String?) {
        val run = generation.incrementAndGet()
        qrJob?.cancel()
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null) }
            runCatching { repository.selectProfile(profile, pin) }
                .onSuccess { user ->
                    if (generation.get() != run) return@onSuccess
                    _state.update { it.copy(user = user, busy = true) }
                    loadHome(run)
                }
                .onFailure { error ->
                    if (generation.get() == run) _state.update { it.copy(busy = false, error = error.message) }
                }
        }
    }

    fun refreshHome() {
        val run = generation.incrementAndGet()
        viewModelScope.launch { loadHome(run) }
    }

    fun openTitle(card: TvMediaCard) {
        val run = generation.incrementAndGet()
        viewModelScope.launch {
            _state.update { it.copy(selectedCard = card, busy = true, error = null) }
            runCatching { repository.title(card.mediaId) }
                .onSuccess { title ->
                    if (generation.get() == run) _state.update { it.copy(route = TvRoute.Title, title = title, busy = false) }
                }
                .onFailure { error ->
                    if (generation.get() == run) _state.update { it.copy(busy = false, error = error.message) }
                }
        }
    }

    fun playCard(card: TvMediaCard, returnRoute: TvRoute = _state.value.route) {
        queue = listOf(card.asPlaybackItem())
        queueIndex = 0
        startPlayback(queue[0], returnRoute)
    }

    fun playTitleEpisode(item: TvPlaybackItem) {
        val title = _state.value.title
        queue = title?.seasons.orEmpty().flatMap { season ->
            season.episodes.map { episode -> episode.asPlaybackItem(title!!.displayTitle) }
        }
        queueIndex = queue.indexOfFirst { it.mediaId == item.mediaId }.takeIf { it >= 0 } ?: 0
        startPlayback(item, TvRoute.Title)
    }

    fun playTitleFromBeginning() {
        val title = _state.value.title ?: return
        val item = title.resumeEpisode?.copy(positionMs = 0)?.asPlaybackItem(title.displayTitle)
            ?: TvPlaybackItem(title.anchorMediaId, title.displayTitle, null, null, null, 0, title.durationMs, title.backdropUrl)
        playTitleEpisode(item)
    }

    fun toggleWatchlist() {
        val title = _state.value.title ?: return
        viewModelScope.launch {
            val enabled = !title.inWatchlist
            runCatching { repository.setWatchlist(title.anchorMediaId, enabled) }
                .onSuccess { _state.update { it.copy(title = title.copy(inWatchlist = enabled)) } }
                .onFailure { error -> _state.update { it.copy(error = error.message) } }
        }
    }

    fun navigate(route: TvRoute) {
        _state.update { it.copy(route = route, error = null) }
    }

    fun back() {
        when (_state.value.route) {
            TvRoute.Player -> {
                val destination = playerReturnRoute
                _state.update { it.copy(route = destination) }
                playback.finish(false)
            }
            TvRoute.Title -> _state.update { it.copy(route = TvRoute.Hub, title = null) }
            TvRoute.Hub -> _state.update { it.copy(route = TvRoute.Profiles) }
            TvRoute.Profiles -> {
                _state.update { it.copy(route = TvRoute.Login) }
                startQr()
            }
            TvRoute.Movies,
            TvRoute.Series,
            TvRoute.Search,
            TvRoute.Genres,
            TvRoute.Downloads,
            TvRoute.LiveTv,
            TvRoute.Notifications,
            TvRoute.Settings,
            -> _state.update { it.copy(route = TvRoute.Hub) }
            TvRoute.Boot,
            TvRoute.Login,
            -> Unit
        }
    }

    fun logout() {
        generation.incrementAndGet()
        playback.finish(false)
        viewModelScope.launch {
            repository.logout()
            _state.value = TvAppState(route = TvRoute.Login)
            startQr()
        }
    }

    fun clearError() {
        _state.update { it.copy(error = null) }
    }

    private suspend fun loadHome(run: Int) {
        _state.update { it.copy(busy = true, error = null) }
        runCatching { repository.home() }
            .onSuccess { home -> if (generation.get() == run) _state.update { it.copy(route = TvRoute.Hub, home = home, busy = false) } }
            .onFailure { error -> if (generation.get() == run) _state.update { it.copy(busy = false, error = error.message) } }
    }

    private fun startPlayback(item: TvPlaybackItem, returnRoute: TvRoute) {
        playerReturnRoute = returnRoute
        _state.update { it.copy(route = TvRoute.Player, selectedEpisodeId = item.mediaId, error = null) }
        playback.start(item)
    }

    private fun playNextAfterEnd() {
        val next = queue.getOrNull(queueIndex + 1)
        if (next == null) {
            _state.update { it.copy(route = playerReturnRoute) }
            return
        }
        queueIndex += 1
        _state.update { it.copy(selectedEpisodeId = next.mediaId) }
        playback.start(next.copy(positionMs = 0))
    }

    override fun onCleared() {
        playback.close()
        super.onCleared()
    }
}
