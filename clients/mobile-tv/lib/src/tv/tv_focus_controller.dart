import 'package:flutter/widgets.dart';

enum TvFocusZone { topRow, section, actionBar }

enum TvDestination {
  home,
  search,
  movies,
  series,
  liveTv,
  recordings,
  downloads,
  watchlist,
  notifications,
  settings,
  profile,
}

class TvNavigationState {
  const TvNavigationState({
    required this.topTab,
    this.sectionIndex = -1,
    this.itemIndex = 0,
  });

  final int topTab;
  final int sectionIndex;
  final int itemIndex;

  bool get isTopRow => sectionIndex < 0;
  TvFocusZone get zone => isTopRow
      ? TvFocusZone.topRow
      : sectionIndex == 900
      ? TvFocusZone.actionBar
      : TvFocusZone.section;

  TvNavigationState copyWith({
    int? topTab,
    int? sectionIndex,
    int? itemIndex,
  }) => TvNavigationState(
    topTab: topTab ?? this.topTab,
    sectionIndex: sectionIndex ?? this.sectionIndex,
    itemIndex: itemIndex ?? this.itemIndex,
  );

  @override
  bool operator ==(Object other) =>
      other is TvNavigationState &&
      other.topTab == topTab &&
      other.sectionIndex == sectionIndex &&
      other.itemIndex == itemIndex;

  @override
  int get hashCode => Object.hash(topTab, sectionIndex, itemIndex);
}

class TvFocusController extends ChangeNotifier {
  TvFocusController({
    required this.topRowNodes,
    required int activeTopTab,
    required int activeSection,
    required int activeItem,
    this.verticalNavigation = false,
  }) : _state = TvNavigationState(
         topTab: activeTopTab,
         sectionIndex: activeSection,
         itemIndex: activeItem,
       );

  TvNavigationState _state;
  TvNavigationState get state => _state;

  final List<FocusNode> topRowNodes;
  final bool verticalNavigation;
  final Map<int, List<FocusNode>> _sectionNodes = {};

  /// Replaces the rows available for DPAD navigation.
  ///
  /// Focus node ownership remains with the widget that created the nodes.
  void replaceSections(
    Map<int, List<FocusNode>> sections, {
    bool notify = true,
  }) {
    _sectionNodes
      ..clear()
      ..addEntries(
        sections.entries
            .where((entry) => entry.value.isNotEmpty)
            .map(
              (entry) => MapEntry(
                entry.key,
                List<FocusNode>.unmodifiable(entry.value),
              ),
            ),
      );
    final normalized = _normalizeState(
      topTab: _state.topTab,
      sectionIndex: _state.sectionIndex,
      itemIndex: _state.itemIndex,
    );
    final changed = normalized != _state;
    _state = normalized;
    if (changed) _restoreFocus();
    if (notify && changed) notifyListeners();
  }

  void setActive({
    required int topTab,
    required int sectionIndex,
    required int itemIndex,
  }) {
    _state = TvNavigationState(
      topTab: topTab,
      sectionIndex: sectionIndex,
      itemIndex: itemIndex,
    );
    _normalize();
    _restoreFocus();
    notifyListeners();
  }

  bool moveLeft() {
    if (topRowNodes.isEmpty) return false;
    if (_state.isTopRow) {
      if (verticalNavigation) return true;
      final next = _state.topTab <= 0 ? _lastTopTab : _state.topTab - 1;
      return _setState(topTab: next, sectionIndex: -1, itemIndex: 0);
    }
    if (_state.itemIndex <= 0) {
      return _setState(
        topTab: _state.topTab,
        sectionIndex: -1,
        itemIndex: 0,
        requestFocus: true,
      );
    }
    return _setState(
      topTab: _state.topTab,
      sectionIndex: _state.sectionIndex,
      itemIndex: _state.itemIndex - 1,
    );
  }

  bool moveRight() {
    if (topRowNodes.isEmpty) return false;
    if (_state.isTopRow) {
      if (verticalNavigation) {
        final next = _firstSectionIndex();
        if (next == null) return true;
        return _setState(
          topTab: _state.topTab,
          sectionIndex: next,
          itemIndex: 0,
        );
      }
      final next = _state.topTab >= _lastTopTab ? 0 : _state.topTab + 1;
      return _setState(topTab: next, sectionIndex: -1, itemIndex: 0);
    }
    final maxItem = _sectionLength(_state.sectionIndex) - 1;
    if (_state.itemIndex < maxItem) {
      return _setState(
        topTab: _state.topTab,
        sectionIndex: _state.sectionIndex,
        itemIndex: _state.itemIndex + 1,
      );
    }
    return true;
  }

  bool moveDown() {
    if (_state.isTopRow) {
      if (verticalNavigation) {
        final next = (_state.topTab + 1).clamp(0, _lastTopTab).toInt();
        return _setState(topTab: next, sectionIndex: -1, itemIndex: 0);
      }
      final next = _firstSectionIndex();
      if (next == null) return true;
      return _setState(topTab: _state.topTab, sectionIndex: next, itemIndex: 0);
    }
    final nextSection = _sectionAfter(_state.sectionIndex);
    if (nextSection == null) return true;
    final clampedItem = _state.itemIndex
        .clamp(0, _sectionLength(nextSection) - 1)
        .toInt();
    return _setState(
      topTab: _state.topTab,
      sectionIndex: nextSection,
      itemIndex: clampedItem,
    );
  }

  bool moveUp() {
    if (_state.isTopRow) {
      if (!verticalNavigation) return true;
      final previous = (_state.topTab - 1).clamp(0, _lastTopTab).toInt();
      return _setState(topTab: previous, sectionIndex: -1, itemIndex: 0);
    }
    final previousSection = _sectionBefore(_state.sectionIndex);
    if (previousSection == null) {
      return _setState(topTab: _state.topTab, sectionIndex: -1, itemIndex: 0);
    }
    final clampedItem = _state.itemIndex
        .clamp(0, _sectionLength(previousSection) - 1)
        .toInt();
    return _setState(
      topTab: _state.topTab,
      sectionIndex: previousSection,
      itemIndex: clampedItem,
    );
  }

  void notifySectionNodeFocus(int sectionIndex, int itemIndex) {
    _setState(
      topTab: _state.topTab,
      sectionIndex: sectionIndex,
      itemIndex: itemIndex,
      requestFocus: false,
      notify: true,
    );
  }

  void notifyTopNodeFocus(int topTab) {
    _setState(
      topTab: topTab,
      sectionIndex: -1,
      itemIndex: 0,
      requestFocus: false,
      notify: true,
    );
  }

  int get _lastTopTab => topRowNodes.isEmpty ? 0 : topRowNodes.length - 1;

  int? _firstSectionIndex() {
    final sections = _orderedSections;
    if (sections.isEmpty) return null;
    return sections.first;
  }

  int? _sectionBefore(int sectionIndex) {
    final sections = _orderedSections;
    final pointer = sections.indexOf(sectionIndex);
    if (pointer <= 0) return null;
    return sections[pointer - 1];
  }

  int? _sectionAfter(int sectionIndex) {
    final sections = _orderedSections;
    final pointer = sections.indexOf(sectionIndex);
    if (pointer < 0 || pointer >= sections.length - 1) return null;
    return sections[pointer + 1];
  }

  List<int> get _orderedSections =>
      _sectionNodes.keys.toList()..sort((a, b) => a.compareTo(b));

  int _sectionLength(int sectionIndex) =>
      (_sectionNodes[sectionIndex]?.length ?? 0).clamp(
        0,
        999,
      ); // ignore 999 cap

  bool _setState({
    required int topTab,
    required int sectionIndex,
    required int itemIndex,
    bool requestFocus = true,
    bool notify = true,
  }) {
    if (topRowNodes.isEmpty) return false;
    final normalized = _normalizeState(
      topTab: topTab,
      sectionIndex: sectionIndex,
      itemIndex: itemIndex,
    );
    final changed = normalized != _state;
    _state = normalized;
    if (requestFocus) _restoreFocus();
    if (notify && changed) notifyListeners();
    return changed;
  }

  TvNavigationState _normalizeState({
    required int topTab,
    required int sectionIndex,
    required int itemIndex,
  }) {
    final clampedTop = topTab.clamp(0, _lastTopTab);
    if (_orderedSections.isEmpty || sectionIndex < 0) {
      return TvNavigationState(
        topTab: clampedTop,
        sectionIndex: -1,
        itemIndex: 0,
      );
    }
    final sections = _orderedSections;
    final normalizedSection = sections.contains(sectionIndex)
        ? sectionIndex
        : sections.first;
    final clampedItem = itemIndex.clamp(
      0,
      (_sectionLength(normalizedSection) - 1).clamp(0, 999),
    );
    return TvNavigationState(
      topTab: clampedTop,
      sectionIndex: normalizedSection,
      itemIndex: clampedItem,
    );
  }

  void _normalize() {
    _state = _normalizeState(
      topTab: _state.topTab,
      sectionIndex: _state.sectionIndex,
      itemIndex: _state.itemIndex,
    );
  }

  void _restoreFocus() {
    final target = _state.isTopRow
        ? topRowNodes.elementAtOrNull(_state.topTab)
        : _sectionNodes[_state.sectionIndex]?.elementAtOrNull(_state.itemIndex);
    final node = target;
    if (node != null && node.canRequestFocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (node.canRequestFocus && !node.hasFocus) {
          node.requestFocus();
        }
      });
    }
  }

  void requestCurrentFocus() => _restoreFocus();
}
