import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/offline_downloads.dart';
import '../../shared_core/title_contract.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import '../../widgets/media_card.dart';
import '../tv_focus_controller.dart';
import 'tv_player_screen.dart';
import '../widgets/tv_media_context_menu.dart';

typedef TvPlayHandler =
    Future<void> Function(MediaItem media, int resumePositionMs);

class TvTitleScreen extends StatefulWidget {
  const TvTitleScreen({
    required this.api,
    required this.media,
    this.titleContract,
    this.onPlay,
    super.key,
  });

  final ApiClient api;
  final MediaItem media;
  final TitleContract? titleContract;
  final TvPlayHandler? onPlay;

  @override
  State<TvTitleScreen> createState() => _TvTitleScreenState();
}

class _TvTitleScreenState extends State<TvTitleScreen> {
  static const _seasonSection = 10;
  static const _peopleSection = 20;
  static const _relatedSection = 30;
  static const _episodeSectionBase = 100;

  late final TitleContract _title;
  late final List<FocusNode> _actionNodes;
  late final TvFocusController _focusController;
  List<FocusNode> _seasonNodes = [];
  List<FocusNode> _episodeNodes = [];
  List<FocusNode> _peopleNodes = [];
  List<FocusNode> _relatedNodes = [];

  TitleExperience? _experience;
  int? _selectedSeason;
  bool _loading = true;
  bool _loadingSeason = false;
  bool _actionBusy = false;
  bool _downloadBusy = false;
  bool _inWatchlist = false;
  bool _watched = false;
  String? _error;
  int _focusRequestEpoch = 0;
  int _loadGeneration = 0;
  bool _selectHoldFired = false;
  bool _selectHoldTracking = false;
  Timer? _selectHoldTimer;
  MediaItem? _selectHoldMedia;

  @override
  void initState() {
    super.initState();
    _title = widget.titleContract ?? TitleUseCase(api: widget.api);
    _actionNodes = List.generate(
      5,
      (index) => FocusNode(
        debugLabel: 'tv-title-action-$index',
        onKeyEvent: _handleKey,
      ),
    );
    _focusController = TvFocusController(
      topRowNodes: _actionNodes,
      activeTopTab: 0,
      activeSection: -1,
      activeItem: 0,
    );
    for (var index = 0; index < _actionNodes.length; index++) {
      final node = _actionNodes[index];
      final itemIndex = index;
      node.addListener(() {
        if (node.hasFocus) {
          _focusController.notifyTopNodeFocus(itemIndex);
        }
      });
    }
    unawaited(_load());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusController.requestCurrentFocus();
    });
  }

  @override
  void dispose() {
    _resetSelectHold();
    for (final node in [
      ..._actionNodes,
      ..._seasonNodes,
      ..._episodeNodes,
      ..._peopleNodes,
      ..._relatedNodes,
    ]) {
      node.dispose();
    }
    _focusController.dispose();
    super.dispose();
  }

  Future<void> _load({
    int? seasonNumber,
    bool focusPlaybackPosition = false,
    String? playedMediaId,
  }) async {
    final generation = ++_loadGeneration;
    final preferredSeason = seasonNumber ?? _selectedSeason;
    final loadingFullTitle = _experience == null || seasonNumber == null;
    setState(() {
      if (loadingFullTitle) {
        _loading = true;
      } else {
        _loadingSeason = true;
      }
      _error = null;
    });
    try {
      final payload = await _loadTitlePayload(seasonNumber: seasonNumber);
      if (!mounted || generation != _loadGeneration) return;
      final next = payload.experience;
      final focusEpisode = focusPlaybackPosition
          ? _resolvePlaybackFocusEpisode(next, playedMediaId)
          : null;
      final selected =
          focusEpisode?.media.seasonNumber ??
          _resolveSelectedSeason(next, preferredSeason);
      final selectedSeason = _seasonByNumber(next, selected);
      final hydrateSelectedSeason =
          seasonNumber == null &&
          selectedSeason != null &&
          _seasonNeedsHydration(selectedSeason);
      setState(() {
        _experience = next;
        _selectedSeason = selected;
        _inWatchlist = payload.inWatchlist;
        _watched = payload.watched;
        _loading = false;
        _loadingSeason = false;
      });
      _rebuildFocusGraph(rebuildSeasons: true);
      if (focusEpisode != null) {
        _focusEpisodeById(focusEpisode.media.id);
      }
      if (hydrateSelectedSeason && selected != null) {
        await _load(
          seasonNumber: selected,
          focusPlaybackPosition: focusPlaybackPosition,
          playedMediaId: playedMediaId,
        );
      }
    } catch (failure) {
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        if (loadingFullTitle) {
          _loading = false;
        }
        _loadingSeason = false;
        _error = _failureMessage(failure);
      });
    }
  }

  Future<TitlePayload> _loadTitlePayload({int? seasonNumber}) {
    final contract = _title;
    if (seasonNumber != null && contract is SeasonAwareTitleContract) {
      return contract.loadTitleSeason(widget.media.id, seasonNumber);
    }
    return contract.loadTitle(widget.media.id);
  }

  int? _resolveSelectedSeason(TitleExperience experience, int? preferred) {
    if (experience.seasons.isEmpty) return null;
    final preferredSeason = _seasonByNumber(experience, preferred);
    if (preferredSeason != null &&
        (preferredSeason.episodes.isNotEmpty ||
            preferredSeason.episodeCount == 0)) {
      return preferredSeason.number;
    }
    final serverSeason = _seasonByNumber(
      experience,
      experience.selectedSeasonNumber,
    );
    if (serverSeason != null &&
        (serverSeason.episodes.isNotEmpty || serverSeason.episodeCount == 0)) {
      return serverSeason.number;
    }
    for (final season in experience.seasons) {
      if (season.episodes.isNotEmpty) return season.number;
    }
    return preferredSeason?.number ??
        serverSeason?.number ??
        experience.seasons.first.number;
  }

  SeasonItem? _seasonByNumber(TitleExperience experience, int? number) {
    if (number == null) return null;
    for (final season in experience.seasons) {
      if (season.number == number) return season;
    }
    return null;
  }

  bool _seasonNeedsHydration(SeasonItem season) =>
      season.episodeCount > 0 &&
      season.episodes.isEmpty &&
      _title is SeasonAwareTitleContract;

  String _seasonButtonLabel(SeasonItem season) =>
      season.number == 0 ? 'Specials' : 'Sæson ${season.number}';

  void _rebuildFocusGraph({required bool rebuildSeasons}) {
    ++_focusRequestEpoch;
    final data = _experience;
    if (data == null) {
      _focusController.replaceSections(const {}, notify: false);
      return;
    }

    if (rebuildSeasons) {
      final oldNodes = _seasonNodes;
      _seasonNodes = List.generate(
        data.seasons.length,
        (index) => FocusNode(
          debugLabel: 'tv-title-section-$_seasonSection-item-$index',
          onKeyEvent: _handleKey,
        ),
      );
      for (var index = 0; index < _seasonNodes.length; index++) {
        final node = _seasonNodes[index];
        final itemIndex = index;
        node.addListener(() {
          if (node.hasFocus) {
            _focusController.notifySectionNodeFocus(_seasonSection, itemIndex);
          }
        });
      }
      for (final node in oldNodes) {
        node.dispose();
      }
    }

    final oldEpisodeNodes = _episodeNodes;
    final episodes = _selectedEpisodes;
    _episodeNodes = List.generate(
      episodes.length,
      (index) => FocusNode(
        debugLabel: 'tv-title-section-${_episodeSectionBase + index}-item-0',
        onKeyEvent: _handleKey,
      ),
    );
    for (var index = 0; index < _episodeNodes.length; index++) {
      final node = _episodeNodes[index];
      final section = _episodeSectionBase + index;
      node.addListener(() {
        if (node.hasFocus) {
          _focusController.notifySectionNodeFocus(section, 0);
        }
      });
    }

    final oldPeopleNodes = _peopleNodes;
    _peopleNodes = List.generate(
      data.people.length,
      (index) => FocusNode(
        debugLabel: 'tv-title-section-$_peopleSection-item-$index',
        onKeyEvent: _handleKey,
      ),
    );
    for (var index = 0; index < _peopleNodes.length; index++) {
      final node = _peopleNodes[index];
      final itemIndex = index;
      node.addListener(() {
        if (node.hasFocus) {
          _focusController.notifySectionNodeFocus(_peopleSection, itemIndex);
        }
      });
    }

    final oldRelatedNodes = _relatedNodes;
    _relatedNodes = List.generate(
      data.related.length,
      (index) => FocusNode(
        debugLabel: 'tv-title-section-$_relatedSection-item-$index',
        onKeyEvent: _handleKey,
      ),
    );
    for (var index = 0; index < _relatedNodes.length; index++) {
      final node = _relatedNodes[index];
      final itemIndex = index;
      node.addListener(() {
        if (node.hasFocus) {
          _focusController.notifySectionNodeFocus(_relatedSection, itemIndex);
        }
      });
    }

    final sections = <int, List<FocusNode>>{};
    if (_seasonNodes.isNotEmpty) sections[_seasonSection] = _seasonNodes;
    if (_peopleNodes.isNotEmpty) sections[_peopleSection] = _peopleNodes;
    if (_relatedNodes.isNotEmpty) sections[_relatedSection] = _relatedNodes;
    for (var index = 0; index < _episodeNodes.length; index++) {
      sections[_episodeSectionBase + index] = [_episodeNodes[index]];
    }
    _focusController.replaceSections(sections, notify: false);
    for (final node in oldEpisodeNodes) {
      node.dispose();
    }
    for (final node in oldPeopleNodes) {
      node.dispose();
    }
    for (final node in oldRelatedNodes) {
      node.dispose();
    }
    _focusController.requestCurrentFocus();
  }

  SeasonItem? get _selectedSeasonData {
    final data = _experience;
    if (data == null) return null;
    for (final season in data.seasons) {
      if (season.number == _selectedSeason) return season;
    }
    return data.seasons.isEmpty ? null : data.seasons.first;
  }

  List<EpisodeItem> get _selectedEpisodes =>
      _selectedSeasonData?.episodes ?? const [];

  EpisodeItem? get _firstEpisode {
    final data = _experience;
    if (data == null) return null;
    for (final season in data.seasons) {
      if (season.episodes.isNotEmpty) return season.episodes.first;
    }
    return null;
  }

  EpisodeItem? _resolvePlaybackFocusEpisode(
    TitleExperience experience,
    String? playedMediaId,
  ) {
    final targetIds = <String>[
      if (experience.resumeEpisode?.media.id.isNotEmpty ?? false)
        experience.resumeEpisode!.media.id,
      if (experience.nextEpisode?.media.id.isNotEmpty ?? false)
        experience.nextEpisode!.media.id,
      if ((playedMediaId ?? '').isNotEmpty) playedMediaId!,
    ];
    for (final targetId in targetIds) {
      final episode = _findEpisodeById(experience, targetId);
      if (episode != null) return episode;
    }
    for (final season in experience.seasons) {
      for (final episode in season.episodes) {
        if (!episode.watched &&
            (episode.positionMs > 0 || episode.progressPercent > 0)) {
          return episode;
        }
      }
    }
    return null;
  }

  EpisodeItem? _findEpisodeById(TitleExperience experience, String id) {
    for (final season in experience.seasons) {
      for (final episode in season.episodes) {
        if (episode.media.id == id) return episode;
      }
    }
    return null;
  }

  void _focusEpisodeById(String episodeId) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final index = _selectedEpisodes.indexWhere(
        (episode) => episode.media.id == episodeId,
      );
      if (index < 0 || index >= _episodeNodes.length) return;
      _focusNode(
        sectionIndex: _episodeSectionBase + index,
        itemIndex: 0,
        node: _episodeNodes[index],
      );
    });
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (_isSelectKey(event.logicalKey)) {
      return _handleSelectKey(event)
          ? KeyEventResult.handled
          : KeyEventResult.ignored;
    }
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    _resetSelectHold();
    final handled = switch (event.logicalKey) {
      LogicalKeyboardKey.arrowLeft => _moveHorizontal(-1),
      LogicalKeyboardKey.arrowRight => _moveHorizontal(1),
      LogicalKeyboardKey.arrowDown => _moveVertical(1),
      LogicalKeyboardKey.arrowUp => _moveVertical(-1),
      LogicalKeyboardKey.escape ||
      LogicalKeyboardKey.goBack ||
      LogicalKeyboardKey.browserBack => _goBack(),
      _ => false,
    };
    return handled ? KeyEventResult.handled : KeyEventResult.ignored;
  }

  bool _isSelectKey(LogicalKeyboardKey key) =>
      key == LogicalKeyboardKey.enter ||
      key == LogicalKeyboardKey.numpadEnter ||
      key == LogicalKeyboardKey.select ||
      key == LogicalKeyboardKey.space;

  bool _handleSelectKey(KeyEvent event) {
    final media = _focusedContextMedia();
    if (media == null) {
      if (event is KeyDownEvent) return _activateFocused();
      return event is KeyUpEvent || event is KeyRepeatEvent;
    }
    if (event is KeyDownEvent) {
      if (_selectHoldTracking) return true;
      _selectHoldTracking = true;
      _selectHoldFired = false;
      _selectHoldMedia = media;
      _selectHoldTimer = Timer(const Duration(milliseconds: 560), () {
        final heldMedia = _selectHoldMedia;
        if (!mounted || !_selectHoldTracking || heldMedia == null) {
          return;
        }
        _selectHoldFired = true;
        _selectHoldTimer = null;
        unawaited(
          _openContextMenu(heldMedia).whenComplete(() {
            if (mounted) _resetSelectHold();
          }),
        );
      });
      return true;
    }
    if (event is KeyRepeatEvent) return true;
    if (event is KeyUpEvent) {
      final fired = _selectHoldFired;
      _resetSelectHold();
      if (fired) return true;
      return _activateFocused();
    }
    return false;
  }

  void _resetSelectHold() {
    _selectHoldTimer?.cancel();
    _selectHoldTimer = null;
    _selectHoldTracking = false;
    _selectHoldFired = false;
    _selectHoldMedia = null;
  }

  MediaItem? _focusedContextMedia() {
    final state = _focusController.state;
    final data = _experience;
    if (state.isTopRow) return data?.title ?? widget.media;
    if (state.sectionIndex == _relatedSection &&
        data != null &&
        state.itemIndex >= 0 &&
        state.itemIndex < data.related.length) {
      return data.related[state.itemIndex];
    }
    final episodeIndex = state.sectionIndex - _episodeSectionBase;
    if (episodeIndex >= 0 && episodeIndex < _selectedEpisodes.length) {
      return _selectedEpisodes[episodeIndex].media;
    }
    return null;
  }

  bool _moveHorizontal(int delta) {
    final state = _focusController.state;
    if (state.sectionIndex >= _episodeSectionBase) return true;
    if (state.isTopRow) {
      final last = _actionNodes.length - 1;
      final target = delta < 0
          ? (state.topTab == 0 ? last : state.topTab - 1)
          : (state.topTab == last ? 0 : state.topTab + 1);
      return _focusNode(
        topTab: target,
        sectionIndex: -1,
        itemIndex: 0,
        node: _actionNodes[target],
      );
    }
    if (state.sectionIndex == _seasonSection) {
      if (_seasonNodes.isEmpty) return true;
      final target = (state.itemIndex + delta)
          .clamp(0, _seasonNodes.length - 1)
          .toInt();
      return _focusNode(
        sectionIndex: _seasonSection,
        itemIndex: target,
        node: _seasonNodes[target],
      );
    }
    if (state.sectionIndex == _peopleSection ||
        state.sectionIndex == _relatedSection) {
      final nodes = state.sectionIndex == _peopleSection
          ? _peopleNodes
          : _relatedNodes;
      if (nodes.isEmpty) return true;
      final target = (state.itemIndex + delta)
          .clamp(0, nodes.length - 1)
          .toInt();
      return _focusNode(
        sectionIndex: state.sectionIndex,
        itemIndex: target,
        node: nodes[target],
      );
    }
    return true;
  }

  bool _moveVertical(int delta) {
    final state = _focusController.state;
    if (delta > 0) {
      if (state.isTopRow) {
        if (_seasonNodes.isNotEmpty) {
          return _focusNode(
            sectionIndex: _seasonSection,
            itemIndex: 0,
            node: _seasonNodes.first,
          );
        }
        if (_peopleNodes.isNotEmpty) {
          return _focusNode(
            sectionIndex: _peopleSection,
            itemIndex: 0,
            node: _peopleNodes.first,
          );
        }
        if (_relatedNodes.isNotEmpty) {
          return _focusNode(
            sectionIndex: _relatedSection,
            itemIndex: 0,
            node: _relatedNodes.first,
          );
        }
        return true;
      }
      if (state.sectionIndex == _seasonSection) {
        if (_episodeNodes.isNotEmpty) {
          return _focusNode(
            sectionIndex: _episodeSectionBase,
            itemIndex: 0,
            node: _episodeNodes.first,
          );
        }
        if (_peopleNodes.isNotEmpty) {
          return _focusNode(
            sectionIndex: _peopleSection,
            itemIndex: 0,
            node: _peopleNodes.first,
          );
        }
        if (_relatedNodes.isNotEmpty) {
          return _focusNode(
            sectionIndex: _relatedSection,
            itemIndex: 0,
            node: _relatedNodes.first,
          );
        }
        return true;
      }
      if (state.sectionIndex == _peopleSection) {
        if (_relatedNodes.isNotEmpty) {
          final target = state.itemIndex
              .clamp(0, _relatedNodes.length - 1)
              .toInt();
          return _focusNode(
            sectionIndex: _relatedSection,
            itemIndex: target,
            node: _relatedNodes[target],
          );
        }
        return true;
      }
      if (state.sectionIndex == _relatedSection) return true;
      final episodeIndex = state.sectionIndex - _episodeSectionBase;
      final next = episodeIndex + 1;
      if (next >= 0 && next < _episodeNodes.length) {
        return _focusNode(
          sectionIndex: _episodeSectionBase + next,
          itemIndex: 0,
          node: _episodeNodes[next],
        );
      }
      if (_peopleNodes.isNotEmpty) {
        return _focusNode(
          sectionIndex: _peopleSection,
          itemIndex: 0,
          node: _peopleNodes.first,
        );
      }
      if (_relatedNodes.isNotEmpty) {
        return _focusNode(
          sectionIndex: _relatedSection,
          itemIndex: 0,
          node: _relatedNodes.first,
        );
      }
      return true;
    }

    if (state.isTopRow) return true;
    if (state.sectionIndex == _relatedSection) {
      if (_peopleNodes.isNotEmpty) {
        final target = state.itemIndex
            .clamp(0, _peopleNodes.length - 1)
            .toInt();
        return _focusNode(
          sectionIndex: _peopleSection,
          itemIndex: target,
          node: _peopleNodes[target],
        );
      }
      if (_episodeNodes.isNotEmpty) {
        return _focusNode(
          sectionIndex: _episodeSectionBase + _episodeNodes.length - 1,
          itemIndex: 0,
          node: _episodeNodes.last,
        );
      }
      if (_seasonNodes.isNotEmpty) {
        return _focusNode(
          sectionIndex: _seasonSection,
          itemIndex: 0,
          node: _seasonNodes.first,
        );
      }
      return _focusNode(
        sectionIndex: -1,
        itemIndex: 0,
        node: _actionNodes[state.topTab],
      );
    }
    if (state.sectionIndex == _peopleSection) {
      if (_episodeNodes.isNotEmpty) {
        return _focusNode(
          sectionIndex: _episodeSectionBase + _episodeNodes.length - 1,
          itemIndex: 0,
          node: _episodeNodes.last,
        );
      }
      if (_seasonNodes.isNotEmpty) {
        return _focusNode(
          sectionIndex: _seasonSection,
          itemIndex: 0,
          node: _seasonNodes.first,
        );
      }
      return _focusNode(
        sectionIndex: -1,
        itemIndex: 0,
        node: _actionNodes[state.topTab],
      );
    }
    if (state.sectionIndex == _seasonSection) {
      return _focusNode(
        sectionIndex: -1,
        itemIndex: 0,
        node: _actionNodes[state.topTab],
      );
    }
    final episodeIndex = state.sectionIndex - _episodeSectionBase;
    if (episodeIndex <= 0) {
      final selectedIndex =
          _experience?.seasons.indexWhere(
            (season) => season.number == _selectedSeason,
          ) ??
          0;
      final seasonIndex = selectedIndex
          .clamp(0, _seasonNodes.length - 1)
          .toInt();
      return _focusNode(
        sectionIndex: _seasonSection,
        itemIndex: seasonIndex,
        node: _seasonNodes[seasonIndex],
      );
    }
    final previous = episodeIndex - 1;
    return _focusNode(
      sectionIndex: _episodeSectionBase + previous,
      itemIndex: 0,
      node: _episodeNodes[previous],
    );
  }

  bool _focusNode({
    int? topTab,
    required int sectionIndex,
    required int itemIndex,
    required FocusNode node,
  }) {
    _focusController.setActive(
      topTab: topTab ?? _focusController.state.topTab,
      sectionIndex: sectionIndex,
      itemIndex: itemIndex,
    );
    final epoch = ++_focusRequestEpoch;
    FocusScope.of(context).requestFocus(node);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || epoch != _focusRequestEpoch) return;
      if (node.canRequestFocus) node.requestFocus();
    });
    return true;
  }

  bool _activateFocused() {
    final state = _focusController.state;
    if (state.isTopRow) {
      _activateAction(state.topTab);
      return true;
    }
    if (state.sectionIndex == _seasonSection) {
      _selectSeason(state.itemIndex);
      return true;
    }
    if (state.sectionIndex == _peopleSection) {
      final data = _experience;
      if (data != null && state.itemIndex < data.people.length) {
        unawaited(_showPerson(data.people[state.itemIndex]));
      }
      return true;
    }
    if (state.sectionIndex == _relatedSection) {
      final data = _experience;
      if (data != null && state.itemIndex < data.related.length) {
        unawaited(_openRelated(data.related[state.itemIndex]));
      }
      return true;
    }
    final episodeIndex = state.sectionIndex - _episodeSectionBase;
    if (episodeIndex >= 0 && episodeIndex < _selectedEpisodes.length) {
      unawaited(_playEpisode(_selectedEpisodes[episodeIndex]));
    }
    return true;
  }

  bool _goBack() {
    unawaited(Navigator.of(context).maybePop());
    return true;
  }

  void _activateAction(int index) {
    if (_loading || _loadingSeason) return;
    if (_experience == null) {
      if (index == 0) unawaited(_load());
      return;
    }
    switch (index) {
      case 0:
        unawaited(_playPrimary(fromStart: false));
      case 1:
        unawaited(_playPrimary(fromStart: true));
      case 2:
        unawaited(_toggleWatchlist());
      case 3:
        unawaited(_toggleWatched());
      case 4:
        unawaited(_download());
    }
  }

  void _selectSeason(int index) {
    final data = _experience;
    if (data == null || index < 0 || index >= data.seasons.length) return;
    final season = data.seasons[index];
    final needsHydration = _seasonNeedsHydration(season);
    if (_selectedSeason != season.number) {
      setState(() => _selectedSeason = season.number);
      _rebuildFocusGraph(rebuildSeasons: false);
    }
    _focusController.setActive(
      topTab: _focusController.state.topTab,
      sectionIndex: _seasonSection,
      itemIndex: index,
    );
    if (needsHydration) {
      unawaited(_load(seasonNumber: season.number));
    }
  }

  Future<void> _playPrimary({required bool fromStart}) async {
    final data = _experience;
    if (data == null) return;
    if (data.title.isSeries || data.mode == 'series') {
      final episode = fromStart
          ? _firstEpisode
          : data.resumeEpisode ?? data.nextEpisode ?? _firstEpisode;
      if (episode == null) {
        _showMessage('Serien har ingen afspilningsklare afsnit.');
        return;
      }
      await _openPlayer(episode.media, fromStart ? 0 : episode.positionMs);
      return;
    }
    final position = fromStart
        ? 0
        : data.title.progress?.positionMs ??
              widget.media.progress?.positionMs ??
              0;
    await _openPlayer(data.title, position);
  }

  Future<void> _playEpisode(EpisodeItem episode) =>
      _openPlayer(episode.media, episode.positionMs);

  Future<void> _openPlayer(MediaItem media, int resumePositionMs) async {
    final handler = widget.onPlay;
    if (handler != null) {
      await handler(media, resumePositionMs);
      return;
    }
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => TvPlayerScreen(
          api: widget.api,
          media: media,
          resumePositionMs: resumePositionMs,
        ),
      ),
    );
    if (mounted) {
      await _load(
        focusPlaybackPosition: media.isEpisode,
        playedMediaId: media.id,
      );
    }
  }

  Future<void> _openRelated(MediaItem media) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => TvTitleScreen(
          api: widget.api,
          media: media,
          titleContract: _title,
          onPlay: widget.onPlay,
        ),
      ),
    );
    if (mounted) _focusController.requestCurrentFocus();
  }

  Future<void> _openContextMenu(MediaItem media) async {
    await showTvMediaContextMenu(
      context: context,
      api: widget.api,
      media: media,
      onOpen: (item) async {
        final data = _experience;
        final sameTitle = data != null && item.id == data.title.id;
        final sameSeriesFromEpisode =
            data != null &&
            item.isEpisode &&
            (data.title.isSeries || data.mode == 'series');
        if (sameTitle || sameSeriesFromEpisode) {
          _focusController.requestCurrentFocus();
          return;
        }
        await _openRelated(item);
      },
      onPlay: (item, resumePositionMs) => _openPlayer(item, resumePositionMs),
    );
    if (mounted) _focusController.requestCurrentFocus();
  }

  Future<void> _showPerson(TitlePerson person) async {
    final image = widget.api.absoluteMediaUrl(
      person.profilePath,
      imageSize: 'w500',
    );
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: TvDesignTokens.surfaceRaised,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
          side: const BorderSide(color: TvDesignTokens.panelBorderSoft),
        ),
        title: Text(person.name),
        content: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 42,
              backgroundColor: const Color(0xFF172231),
              backgroundImage: image.isEmpty ? null : NetworkImage(image),
              child: image.isEmpty
                  ? const Icon(Icons.person_outline, size: 42)
                  : null,
            ),
            const SizedBox(width: 18),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 320),
              child: Text(
                [person.role, person.department]
                    .whereType<String>()
                    .where((value) => value.trim().isNotEmpty)
                    .join(' · '),
                style: const TextStyle(color: TvDesignTokens.textMuted),
              ),
            ),
          ],
        ),
        actions: [
          FilledButton(
            autofocus: true,
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Luk'),
          ),
        ],
      ),
    );
    if (mounted) _focusController.requestCurrentFocus();
  }

  Future<void> _toggleWatchlist() async {
    if (_actionBusy) return;
    final next = !_inWatchlist;
    setState(() => _actionBusy = true);
    try {
      await _title.setWatchlist(widget.media.id, included: next);
      if (!mounted) return;
      setState(() {
        _inWatchlist = next;
        _actionBusy = false;
      });
    } catch (failure) {
      if (!mounted) return;
      setState(() {
        _actionBusy = false;
        _error = _failureMessage(failure);
      });
    }
  }

  Future<void> _toggleWatched() async {
    if (_actionBusy) return;
    final next = !_watched;
    setState(() => _actionBusy = true);
    try {
      await _title.setWatched(widget.media.id, watched: next);
      if (!mounted) return;
      setState(() {
        _watched = next;
        _actionBusy = false;
      });
    } catch (failure) {
      if (!mounted) return;
      setState(() {
        _actionBusy = false;
        _error = _failureMessage(failure);
      });
    }
  }

  Future<void> _download() async {
    if (_downloadBusy) return;
    final target = _downloadTarget;
    if (target == null) {
      _showMessage('Der er endnu ikke et afsnit, som kan downloades.');
      return;
    }
    final quality = await showDialog<int>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF090B0E),
        title: const Text('Download til offline'),
        content: const Text(
          'Vælg billedkvalitet. Filen klargøres som kompatibel H.264/AAC MP4.',
        ),
        actions: [
          for (final height in const [360, 480, 720, 1080])
            OutlinedButton(
              autofocus: height == 720,
              onPressed: () => Navigator.of(dialogContext).pop(height),
              child: Text('${height}p'),
            ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Annuller'),
          ),
        ],
      ),
    );
    if (quality == null || !mounted) {
      _focusController.requestCurrentFocus();
      return;
    }
    setState(() => _downloadBusy = true);
    try {
      final manager = OfflineDownloadsManager.instance;
      await manager.configure(widget.api);
      await manager.queue(target.id, quality);
      if (mounted) _showMessage('${target.title} er føjet til downloads.');
    } catch (failure) {
      if (mounted) setState(() => _error = _failureMessage(failure));
    } finally {
      if (mounted) {
        setState(() => _downloadBusy = false);
        _focusController.requestCurrentFocus();
      }
    }
  }

  MediaItem? get _downloadTarget {
    final data = _experience;
    if (data == null) return null;
    if (data.title.isSeries || data.mode == 'series') {
      return (data.resumeEpisode ?? data.nextEpisode ?? _firstEpisode)?.media;
    }
    return data.title;
  }

  String _failureMessage(Object failure) => failure is ApiException
      ? failure.message
      : 'Handlingen kunne ikke gennemføres.';

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  String _actionLabel(int index) {
    final data = _experience;
    if (data == null) {
      return const [
        'Prøv igen',
        'Fra begyndelsen',
        'Min liste',
        'Set',
        'Download',
      ][index];
    }
    return switch (index) {
      0 =>
        data.resumeEpisode != null || widget.media.progress != null
            ? 'Fortsæt'
            : data.nextEpisode != null
            ? 'Afspil næste'
            : 'Afspil',
      1 => 'Fra begyndelsen',
      2 => _inWatchlist ? 'Fjern fra Min liste' : 'Føj til Min liste',
      3 => _watched ? 'Markér som uset' : 'Markér som set',
      _ => _downloadBusy ? 'Klargør download' : 'Download',
    };
  }

  IconData _actionIcon(int index) => switch (index) {
    0 => Icons.play_arrow_rounded,
    1 => Icons.restart_alt_rounded,
    2 => _inWatchlist ? Icons.bookmark : Icons.bookmark_outline,
    3 => _watched ? Icons.check_circle : Icons.check_circle_outline,
    _ => Icons.download_for_offline_outlined,
  };

  bool _actionEnabled(int index) {
    if (_loading) return false;
    if (_experience == null) return index == 0;
    if ((index == 2 || index == 3) && _actionBusy) return false;
    if (index == 4 && _downloadBusy) return false;
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final data = _experience;
    final media = data?.title ?? widget.media;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (_, _) => _goBack(),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Focus(
          canRequestFocus: true,
          onKeyEvent: _handleKey,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHero(media, data),
                if (_loading)
                  const LinearProgressIndicator(
                    minHeight: 2,
                    color: Color(0xFF51A5FF),
                    backgroundColor: Color(0xFF13202C),
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      TvDesignTokens.pageHorizontalPadding,
                      14,
                      TvDesignTokens.pageHorizontalPadding,
                      0,
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: Color(0xFFFF9A9A),
                        fontSize: TvDesignTokens.bodyTextSize,
                      ),
                    ),
                  ),
                if (data != null) _buildInformation(data),
                if (data != null && data.seasons.isNotEmpty)
                  _buildSeriesContent(data),
                if (data != null &&
                    (data.people.isNotEmpty || data.related.isNotEmpty))
                  _buildDiscoveryContent(data),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHero(MediaItem media, TitleExperience? data) {
    final backdrop = widget.api.absoluteMediaUrl(
      media.backdropPath,
      imageSize: 'large',
    );
    final poster = widget.api.absoluteMediaUrl(
      media.posterPath,
      imageSize: 'large',
    );
    final metadata = <String>[
      if (media.releaseYear != null) '${media.releaseYear}',
      if (media.durationMs != null && !media.isSeries)
        _formatDuration(media.durationMs!),
      if (media.is4k) '4K',
      if (media.isHdr) media.hdr!,
      ...?data?.genres.take(3),
      if (media.rating != null) '★ ${media.rating!.toStringAsFixed(1)}/10',
    ];
    return SizedBox(
      height: TvDesignTokens.detailHeroHeight,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  TvDesignTokens.backgroundWarm,
                  TvDesignTokens.background,
                ],
              ),
            ),
          ),
          if (backdrop.isNotEmpty)
            Image.network(
              backdrop,
              fit: BoxFit.cover,
              alignment: Alignment.center,
              errorBuilder: (_, _, _) => poster.isEmpty
                  ? const SizedBox.shrink()
                  : Align(
                      alignment: Alignment.centerRight,
                      child: FractionallySizedBox(
                        widthFactor: 0.34,
                        child: Image.network(poster, fit: BoxFit.cover),
                      ),
                    ),
            )
          else if (poster.isNotEmpty)
            Align(
              alignment: Alignment.centerRight,
              child: FractionallySizedBox(
                widthFactor: 0.34,
                child: Image.network(poster, fit: BoxFit.cover),
              ),
            ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerRight,
                end: Alignment.centerLeft,
                colors: [
                  Color(0x14040506),
                  Color(0xC8040506),
                  Color(0xFF040506),
                ],
                stops: [0, 0.48, 1],
              ),
            ),
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, TvDesignTokens.background],
                stops: [0.66, 1],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              TvDesignTokens.pageHorizontalPadding,
              16,
              TvDesignTokens.pageHorizontalPadding,
              12,
            ),
            child: Align(
              alignment: Alignment.bottomLeft,
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: TvDesignTokens.detailContentWidth,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      media.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 34,
                        height: 1.04,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.35,
                      ),
                    ),
                    if (metadata.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        metadata.join('  •  '),
                        style: const TextStyle(
                          color: TvDesignTokens.textMuted,
                          fontSize: 12.8,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 7,
                      children: List.generate(
                        _actionNodes.length,
                        (index) => _TvTitleActionButton(
                          focusNode: _actionNodes[index],
                          onKeyEvent: _handleKey,
                          icon: _actionIcon(index),
                          label: _actionLabel(index),
                          primary: index == 0,
                          enabled: _actionEnabled(index),
                          busy:
                              ((index == 2 || index == 3) && _actionBusy) ||
                              (index == 4 && _downloadBusy),
                          onPressed: () => _activateAction(index),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInformation(TitleExperience data) {
    final media = data.title;
    final video = <String>[
      if (media.height != null) '${media.height}p',
      if ((media.videoCodec ?? '').trim().isNotEmpty)
        media.videoCodec!.toUpperCase(),
    ].join(' · ');
    final rows = <MapEntry<String, String>>[
      if (media.releaseYear != null)
        MapEntry<String, String>('Udgivet', '${media.releaseYear}'),
      if (media.durationMs != null && !media.isSeries)
        MapEntry<String, String>(
          'Varighed',
          _formatDuration(media.durationMs!),
        ),
      if (media.rating != null)
        MapEntry<String, String>(
          'Bedømmelse',
          '${media.rating!.toStringAsFixed(1)}/10',
        ),
      if (video.isNotEmpty) MapEntry<String, String>('Video', video),
      if ((media.audioCodec ?? '').trim().isNotEmpty)
        MapEntry<String, String>('Lyd', media.audioCodec!.toUpperCase()),
      if ((media.container ?? '').trim().isNotEmpty)
        MapEntry<String, String>('Format', media.container!.toUpperCase()),
    ];
    final overview = (media.overview ?? '').trim();
    if (overview.isEmpty && rows.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        TvDesignTokens.pageHorizontalPadding,
        10,
        TvDesignTokens.pageHorizontalPadding,
        0,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Detaljer',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (overview.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    overview,
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFFC6D2DD),
                      fontSize: 13,
                      height: 1.34,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (rows.isNotEmpty) ...[
            const SizedBox(width: 18),
            Container(
              width: 292,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0x99040506),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF263747)),
              ),
              child: Column(
                children: [
                  for (var index = 0; index < rows.length; index++) ...[
                    _TvDetailRow(
                      label: rows[index].key,
                      value: rows[index].value,
                    ),
                    if (index != rows.length - 1)
                      const Divider(height: 8, color: Color(0xFF25313D)),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSeriesContent(TitleExperience data) {
    final episodes = _selectedEpisodes;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        TvDesignTokens.pageHorizontalPadding,
        14,
        TvDesignTokens.pageHorizontalPadding,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Sæsoner og afsnit',
            style: TextStyle(
              fontSize: TvDesignTokens.sectionTitleSize - 2,
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: List.generate(data.seasons.length, (index) {
                final season = data.seasons[index];
                return Padding(
                  padding: const EdgeInsets.only(right: 7),
                  child: _TvSeasonButton(
                    focusNode: _seasonNodes[index],
                    onKeyEvent: _handleKey,
                    label: _seasonButtonLabel(season),
                    selected: season.number == _selectedSeason,
                    onPressed: () => _selectSeason(index),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(height: 12),
          if (_loadingSeason)
            const Text(
              'Indlæser sæson...',
              style: TextStyle(
                color: Color(0xFF9CAFC0),
                fontSize: TvDesignTokens.bodyTextSize,
              ),
            )
          else if (episodes.isEmpty)
            Text(
              _selectedSeasonData != null &&
                      _seasonNeedsHydration(_selectedSeasonData!)
                  ? 'Sæsonen kunne ikke indlæses. Vælg den igen for at prøve.'
                  : 'Der er ingen afsnit i denne sæson.',
              style: const TextStyle(
                color: Color(0xFF9CAFC0),
                fontSize: TvDesignTokens.bodyTextSize,
              ),
            )
          else
            ...List.generate(
              episodes.length,
              (index) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: _TvEpisodeTile(
                  focusNode: _episodeNodes[index],
                  onKeyEvent: _handleKey,
                  api: widget.api,
                  episode: episodes[index],
                  statusLabel: _episodeStatusLabel(episodes[index], data),
                  onPressed: () => unawaited(_playEpisode(episodes[index])),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDiscoveryContent(TitleExperience data) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        TvDesignTokens.pageHorizontalPadding,
        16,
        TvDesignTokens.pageHorizontalPadding,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (data.people.isNotEmpty) ...[
            const Text(
              'Skuespillere og crew',
              style: TextStyle(
                fontSize: TvDesignTokens.sectionTitleSize - 3,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 146,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: data.people.length,
                separatorBuilder: (_, _) => const SizedBox(width: 7),
                itemBuilder: (_, index) => _TvPersonCard(
                  api: widget.api,
                  person: data.people[index],
                  focusNode: _peopleNodes[index],
                  onKeyEvent: _handleKey,
                  onPressed: () => unawaited(_showPerson(data.people[index])),
                ),
              ),
            ),
          ],
          if (data.people.isNotEmpty && data.related.isNotEmpty)
            const SizedBox(height: 16),
          if (data.related.isNotEmpty) ...[
            Text(
              data.title.isSeries || data.title.isEpisode
                  ? 'Lignende serier'
                  : 'Lignende film',
              style: const TextStyle(
                fontSize: TvDesignTokens.sectionTitleSize - 3,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: TvDesignTokens.cardHeight,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: data.related.length,
                separatorBuilder: (_, _) =>
                    const SizedBox(width: TvDesignTokens.cardGap),
                itemBuilder: (_, index) => MediaPosterCard(
                  api: widget.api,
                  media: data.related[index],
                  width: TvDesignTokens.cardWidth,
                  isTv: true,
                  focusNode: _relatedNodes[index],
                  heroTag: 'tv-title-related-${data.related[index].id}',
                  onPressed: () => unawaited(_openRelated(data.related[index])),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _formatDuration(int durationMs) {
    final minutes = Duration(milliseconds: durationMs).inMinutes;
    if (minutes < 60) return '$minutes min';
    return '${minutes ~/ 60} t ${minutes % 60} min';
  }

  String? _episodeStatusLabel(EpisodeItem episode, TitleExperience data) {
    final id = episode.media.id;
    if (data.resumeEpisode?.media.id == id) return 'Fortsæt her';
    if (data.nextEpisode?.media.id == id) return 'Næste afsnit';
    if (!episode.watched &&
        (episode.positionMs > 0 || episode.progressPercent > 0)) {
      final percent = episode.progressPercent > 0
          ? episode.progressPercent.round()
          : null;
      return percent == null ? 'I gang' : '$percent% set';
    }
    return null;
  }
}

class _TvPersonCard extends StatefulWidget {
  const _TvPersonCard({
    required this.api,
    required this.person,
    required this.focusNode,
    required this.onKeyEvent,
    required this.onPressed,
  });

  final ApiClient api;
  final TitlePerson person;
  final FocusNode focusNode;
  final KeyEventResult Function(FocusNode, KeyEvent) onKeyEvent;
  final VoidCallback onPressed;

  @override
  State<_TvPersonCard> createState() => _TvPersonCardState();
}

class _TvPersonCardState extends State<_TvPersonCard> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final image = widget.api.absoluteMediaUrl(
      widget.person.profilePath,
      imageSize: 'w500',
    );
    return Focus(
      focusNode: widget.focusNode,
      onKeyEvent: widget.onKeyEvent,
      onFocusChange: (value) {
        setState(() => _focused = value);
        if (value) _ensureVisible(context);
      },
      child: GestureDetector(
        onTap: widget.onPressed,
        child: AnimatedContainer(
          duration: TvDesignTokens.focusAnimationDuration,
          width: 106,
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            gradient: _focused
                ? const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF2A2214), Color(0xFF171E26)],
                  )
                : null,
            color: _focused ? null : TvDesignTokens.surfaceGlass,
            borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
            border: Border.all(
              color: _focused
                  ? TvDesignTokens.goldSoft
                  : TvDesignTokens.panelBorderSoft,
              width: _focused ? TvDesignTokens.focusBorderWidth : 1,
            ),
            boxShadow: _focused
                ? const [
                    BoxShadow(
                      color: Color(0x44FFC857),
                      blurRadius: 16,
                      offset: Offset(0, 7),
                    ),
                  ]
                : const [],
          ),
          child: Column(
            children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: const Color(0xFF172231),
                backgroundImage: image.isEmpty ? null : NetworkImage(image),
                child: image.isEmpty
                    ? const Icon(Icons.person_outline, size: 34)
                    : null,
              ),
              const SizedBox(height: 9),
              Text(
                widget.person.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12.8,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                widget.person.subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Color(0xFF9CAFC0), fontSize: 10),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TvTitleActionButton extends StatefulWidget {
  const _TvTitleActionButton({
    required this.focusNode,
    required this.onKeyEvent,
    required this.icon,
    required this.label,
    required this.primary,
    required this.enabled,
    required this.busy,
    required this.onPressed,
  });

  final FocusNode focusNode;
  final KeyEventResult Function(FocusNode, KeyEvent) onKeyEvent;
  final IconData icon;
  final String label;
  final bool primary;
  final bool enabled;
  final bool busy;
  final VoidCallback onPressed;

  @override
  State<_TvTitleActionButton> createState() => _TvTitleActionButtonState();
}

class _TvTitleActionButtonState extends State<_TvTitleActionButton> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) => Focus(
    focusNode: widget.focusNode,
    onKeyEvent: widget.onKeyEvent,
    onFocusChange: (value) => setState(() => _focused = value),
    child: GestureDetector(
      onTap: widget.enabled ? widget.onPressed : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        height: TvDesignTokens.actionButtonHeight,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: widget.primary
              ? const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [TvDesignTokens.focusFill, TvDesignTokens.gold],
                )
              : null,
          color: widget.primary ? null : const Color(0xD00B1017),
          border: Border.all(
            color: _focused
                ? Colors.white
                : widget.primary
                ? const Color(0x99FFE8A3)
                : TvDesignTokens.panelBorderSoft,
            width: _focused ? 2 : 1,
          ),
          boxShadow: _focused
              ? const [
                  BoxShadow(
                    color: Color(0x55FFC857),
                    blurRadius: 18,
                    offset: Offset(0, 7),
                  ),
                ]
              : const [],
        ),
        child: Opacity(
          opacity: widget.enabled ? 1 : 0.45,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.busy)
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Icon(
                  widget.icon,
                  size: widget.primary ? 20 : 18,
                  color: widget.primary ? Colors.black : Colors.white,
                ),
              const SizedBox(width: 8),
              Text(
                widget.label,
                style: TextStyle(
                  color: widget.primary ? Colors.black : Colors.white,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _TvDetailRow extends StatelessWidget {
  const _TvDetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SizedBox(
        width: 82,
        child: Text(
          label,
          style: const TextStyle(color: Color(0xFF91A4B5), fontSize: 11),
        ),
      ),
      Expanded(
        child: Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        ),
      ),
    ],
  );
}

class _TvSeasonButton extends StatefulWidget {
  const _TvSeasonButton({
    required this.focusNode,
    required this.onKeyEvent,
    required this.label,
    required this.selected,
    required this.onPressed,
  });

  final FocusNode focusNode;
  final KeyEventResult Function(FocusNode, KeyEvent) onKeyEvent;
  final String label;
  final bool selected;
  final VoidCallback onPressed;

  @override
  State<_TvSeasonButton> createState() => _TvSeasonButtonState();
}

class _TvSeasonButtonState extends State<_TvSeasonButton> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) => Focus(
    focusNode: widget.focusNode,
    onKeyEvent: widget.onKeyEvent,
    onFocusChange: (value) {
      setState(() => _focused = value);
      if (value) _ensureVisible(context);
    },
    child: GestureDetector(
      onTap: widget.onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 130),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: _focused
              ? const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [TvDesignTokens.focusFill, TvDesignTokens.gold],
                )
              : null,
          color: _focused
              ? null
              : widget.selected
              ? TvDesignTokens.selectedFill
              : TvDesignTokens.surfaceGlass,
          border: Border.all(
            color: _focused
                ? Colors.white
                : widget.selected
                ? const Color(0x99FFC857)
                : TvDesignTokens.panelBorderSoft,
            width: _focused ? TvDesignTokens.focusBorderWidth : 1,
          ),
          boxShadow: _focused
              ? const [
                  BoxShadow(
                    color: Color(0x55FFC857),
                    blurRadius: 16,
                    offset: Offset(0, 7),
                  ),
                ]
              : const [],
        ),
        child: Text(
          widget.label,
          style: TextStyle(
            color: _focused ? const Color(0xFF090806) : Colors.white,
            fontSize: 14.5,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    ),
  );
}

class _TvEpisodeTile extends StatefulWidget {
  const _TvEpisodeTile({
    required this.focusNode,
    required this.onKeyEvent,
    required this.api,
    required this.episode,
    this.statusLabel,
    required this.onPressed,
  });

  final FocusNode focusNode;
  final KeyEventResult Function(FocusNode, KeyEvent) onKeyEvent;
  final ApiClient api;
  final EpisodeItem episode;
  final String? statusLabel;
  final VoidCallback onPressed;

  @override
  State<_TvEpisodeTile> createState() => _TvEpisodeTileState();
}

class _TvEpisodeStatusBadge extends StatelessWidget {
  const _TvEpisodeStatusBadge(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: const Color(0xE6FFE8A3),
      borderRadius: BorderRadius.circular(999),
      boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 10)],
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Text(
        label,
        style: const TextStyle(
          color: Color(0xFF090806),
          fontSize: 10.5,
          height: 1,
          fontWeight: FontWeight.w900,
        ),
      ),
    ),
  );
}

class _TvEpisodeTileState extends State<_TvEpisodeTile> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final media = widget.episode.media;
    final statusLabel = widget.statusLabel;
    final active = statusLabel != null && statusLabel.isNotEmpty;
    final still = widget.api.absoluteMediaUrl(
      widget.episode.stillPath ?? media.backdropPath,
    );
    return Focus(
      focusNode: widget.focusNode,
      onKeyEvent: widget.onKeyEvent,
      onFocusChange: (value) {
        setState(() => _focused = value);
        if (value) _ensureVisible(context);
      },
      child: GestureDetector(
        onTap: widget.onPressed,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 130),
          height: TvDesignTokens.episodeTileHeight,
          decoration: BoxDecoration(
            gradient: _focused
                ? const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF2A2214), Color(0xFF141A21)],
                  )
                : active
                ? const LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [Color(0x332A2214), Color(0x19141A21)],
                  )
                : null,
            color: _focused || active ? null : TvDesignTokens.surfaceGlass,
            borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
            border: Border.all(
              color: _focused
                  ? TvDesignTokens.focusFill
                  : active
                  ? const Color(0x99FFE8A3)
                  : TvDesignTokens.panelBorderSoft,
              width: _focused ? TvDesignTokens.focusBorderWidth : 1,
            ),
          ),
          clipBehavior: Clip.antiAlias,
          foregroundDecoration: _focused
              ? BoxDecoration(
                  borderRadius: BorderRadius.circular(
                    TvDesignTokens.chromeRadius,
                  ),
                  border: Border.all(color: const Color(0x33FFFFFF), width: 1),
                )
              : null,
          child: Row(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 130),
                width: active || _focused ? 5 : 0,
                height: double.infinity,
                color: _focused
                    ? TvDesignTokens.focusFill
                    : const Color(0x99FFE8A3),
              ),
              SizedBox(
                width: 170,
                height: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (still.isNotEmpty)
                      Image.network(
                        still,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => const SizedBox.shrink(),
                      )
                    else
                      const ColoredBox(color: Color(0xFF182939)),
                    const Center(
                      child: Icon(
                        Icons.play_circle_fill_rounded,
                        size: 38,
                        color: Color(0xEEFFFFFF),
                      ),
                    ),
                    if (widget.episode.progressPercent > 0)
                      Align(
                        alignment: Alignment.bottomCenter,
                        child: LinearProgressIndicator(
                          minHeight: 5,
                          value: (widget.episode.progressPercent / 100)
                              .clamp(0, 1)
                              .toDouble(),
                          color: TvDesignTokens.cyan,
                          backgroundColor: const Color(0x66000000),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              media.episodeLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 16.5,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          if (widget.episode.watched)
                            const Icon(
                              Icons.check_circle,
                              color: Color(0xFF65C58A),
                            ),
                          if (statusLabel != null &&
                              statusLabel.isNotEmpty) ...[
                            const SizedBox(width: 8),
                            _TvEpisodeStatusBadge(statusLabel),
                          ],
                        ],
                      ),
                      if ((media.overview ?? '').trim().isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          media.overview!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: TvDesignTokens.textMuted,
                            fontSize: 13.5,
                            height: 1.25,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void _ensureVisible(BuildContext context) {
  WidgetsBinding.instance.addPostFrameCallback((_) {
    if (!context.mounted) return;
    Scrollable.ensureVisible(
      context,
      alignment: 0.5,
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOut,
    );
  });
}
