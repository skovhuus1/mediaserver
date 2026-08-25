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
  bool _actionBusy = false;
  bool _downloadBusy = false;
  bool _inWatchlist = false;
  bool _watched = false;
  String? _error;
  int _focusRequestEpoch = 0;

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

  Future<void> _load() async {
    final preferredSeason = _selectedSeason;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final payload = await _title.loadTitle(widget.media.id);
      if (!mounted) return;
      final next = payload.experience;
      final selected = _containsSeason(next, preferredSeason)
          ? preferredSeason
          : next.selectedSeasonNumber ??
                (next.seasons.isEmpty ? null : next.seasons.first.number);
      setState(() {
        _experience = next;
        _selectedSeason = selected;
        _inWatchlist = payload.inWatchlist;
        _watched = payload.watched;
        _loading = false;
      });
      _rebuildFocusGraph(rebuildSeasons: true);
    } catch (failure) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _failureMessage(failure);
      });
    }
  }

  bool _containsSeason(TitleExperience experience, int? number) =>
      number != null &&
      experience.seasons.any((season) => season.number == number);

  void _rebuildFocusGraph({required bool rebuildSeasons}) {
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

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final handled = switch (event.logicalKey) {
      LogicalKeyboardKey.arrowLeft => _moveHorizontal(-1),
      LogicalKeyboardKey.arrowRight => _moveHorizontal(1),
      LogicalKeyboardKey.arrowDown => _moveVertical(1),
      LogicalKeyboardKey.arrowUp => _moveVertical(-1),
      LogicalKeyboardKey.enter ||
      LogicalKeyboardKey.select => _activateFocused(),
      LogicalKeyboardKey.escape ||
      LogicalKeyboardKey.goBack ||
      LogicalKeyboardKey.browserBack => _goBack(),
      _ => false,
    };
    return handled ? KeyEventResult.handled : KeyEventResult.ignored;
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
      if (mounted && epoch == _focusRequestEpoch) node.requestFocus();
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
    if (_loading) return;
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
    if (_selectedSeason != season.number) {
      setState(() => _selectedSeason = season.number);
      _rebuildFocusGraph(rebuildSeasons: false);
    }
    _focusController.setActive(
      topTab: _focusController.state.topTab,
      sectionIndex: _seasonSection,
      itemIndex: index,
    );
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
    if (mounted) await _load();
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

  Future<void> _showPerson(TitlePerson person) async {
    final image = widget.api.absoluteMediaUrl(
      person.profilePath,
      imageSize: 'w500',
    );
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF101B26),
        title: Text(person.name),
        content: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 42,
              backgroundColor: const Color(0xFF1A2A38),
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
                style: const TextStyle(color: Color(0xFFB8C8D6)),
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
        backgroundColor: TvDesignTokens.background,
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
                        fontSize: 36,
                        height: 1.04,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0,
                      ),
                    ),
                    if (metadata.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        metadata.join('  •  '),
                        style: const TextStyle(
                          color: Color(0xFFC8D8E6),
                          fontSize: 12.8,
                          fontWeight: FontWeight.w600,
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
                    label: '${season.label} · ${season.episodeCount}',
                    selected: season.number == _selectedSeason,
                    onPressed: () => _selectSeason(index),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(height: 12),
          if (episodes.isEmpty)
            const Text(
              'Der er ingen afsnit i denne sæson.',
              style: TextStyle(
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
            color: _focused ? const Color(0xFF332A1A) : TvDesignTokens.surface,
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
                      color: Color(0x44F7C35F),
                      blurRadius: 13,
                      offset: Offset(0, 5),
                    ),
                  ]
                : const [],
          ),
          child: Column(
            children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: const Color(0xFF1B2A38),
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
          color: widget.primary
              ? TvDesignTokens.goldSoft
              : const Color(0xB3040506),
          border: Border.all(
            color: _focused ? Colors.white : TvDesignTokens.panelBorderSoft,
            width: _focused ? 2 : 1,
          ),
          boxShadow: _focused
              ? const [
                  BoxShadow(
                    color: Color(0x55F7C35F),
                    blurRadius: 15,
                    offset: Offset(0, 5),
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
                  fontSize: 12.8,
                  fontWeight: FontWeight.w700,
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
          borderRadius: BorderRadius.circular(8),
          color: _focused
              ? const Color(0xFF332A1A)
              : widget.selected
              ? const Color(0xFF211A10)
              : TvDesignTokens.surface,
          border: Border.all(
            color: _focused
                ? TvDesignTokens.goldSoft
                : widget.selected
                ? const Color(0x99F7C35F)
                : TvDesignTokens.panelBorderSoft,
            width: _focused ? TvDesignTokens.focusBorderWidth : 1,
          ),
        ),
        child: Text(
          widget.label,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
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
    required this.onPressed,
  });

  final FocusNode focusNode;
  final KeyEventResult Function(FocusNode, KeyEvent) onKeyEvent;
  final ApiClient api;
  final EpisodeItem episode;
  final VoidCallback onPressed;

  @override
  State<_TvEpisodeTile> createState() => _TvEpisodeTileState();
}

class _TvEpisodeTileState extends State<_TvEpisodeTile> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final media = widget.episode.media;
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
            color: _focused ? const Color(0xFF332A1A) : TvDesignTokens.surface,
            borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
            border: Border.all(
              color: _focused
                  ? TvDesignTokens.goldSoft
                  : TvDesignTokens.panelBorderSoft,
              width: _focused ? TvDesignTokens.focusBorderWidth : 1,
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: Row(
            children: [
              SizedBox(
                width: 176,
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
                        color: Colors.white,
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
                          color: const Color(0xFF51A5FF),
                          backgroundColor: const Color(0x66000000),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 18,
                    vertical: 12,
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
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          if (widget.episode.watched)
                            const Icon(
                              Icons.check_circle,
                              color: Color(0xFF65C58A),
                            ),
                        ],
                      ),
                      if ((media.overview ?? '').trim().isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          media.overview!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFFAFC0CF),
                            fontSize: 14,
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
