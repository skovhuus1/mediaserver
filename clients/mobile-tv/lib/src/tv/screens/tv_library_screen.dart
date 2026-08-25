import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../shared_core/library_contract.dart';
import '../../shared_core/paged_catalog_controller.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import '../../widgets/media_card.dart';
import '../widgets/tv_media_context_menu.dart';

class TvLibraryScreen extends StatefulWidget {
  const TvLibraryScreen({
    required this.library,
    required this.api,
    required this.label,
    required this.mediaType,
    required this.onPlay,
    required this.onOpen,
    this.onPlayWithPosition,
    this.category,
    this.sort = 'title',
    super.key,
  });

  final LibraryContract library;
  final ApiClient api;
  final String label;
  final String mediaType;
  final String? category;
  final String sort;
  final ValueChanged<MediaItem> onPlay;
  final TvMediaContextPlayHandler? onPlayWithPosition;
  final ValueChanged<MediaItem> onOpen;

  @override
  State<TvLibraryScreen> createState() => _TvLibraryScreenState();
}

class _TvLibraryScreenState extends State<TvLibraryScreen> {
  final List<FocusNode> _itemNodes = [];
  final FocusNode _footerNode = FocusNode(debugLabel: 'tv-library-footer');
  final ScrollController _gridController = ScrollController();
  late final PagedCatalogController _catalog;
  int _focusedItemIndex = 0;
  int _columnCount = 1;
  bool _selectHoldFired = false;
  bool _selectHoldTracking = false;
  Timer? _selectHoldTimer;
  MediaItem? _selectHoldMedia;

  PagedCatalogState get _state => _catalog.state;
  bool get _showFooter => _state.error != null || _state.loadingMore;

  @override
  void initState() {
    super.initState();
    _catalog = PagedCatalogController(
      library: widget.library,
      mediaType: widget.mediaType,
      category: widget.category,
      sort: widget.sort,
    )..addListener(_catalogChanged);
    _footerNode.addListener(_refresh);
    _gridController.addListener(_scrollChanged);
    unawaited(_catalog.loadInitial());
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  void _catalogChanged() {
    if (!mounted) return;
    final footerHadFocus = _footerNode.hasFocus;
    _syncItemNodes(_state.items.length);
    setState(() {});
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_state.items.isNotEmpty &&
          (!_itemNodes.any((node) => node.hasFocus) ||
              (footerHadFocus && !_showFooter))) {
        _requestItemFocus(
          _focusedItemIndex.clamp(0, _itemNodes.length - 1).toInt(),
        );
      } else if (_state.items.isEmpty && _state.error != null) {
        _footerNode.requestFocus();
      }
    });
  }

  void _scrollChanged() {
    if (!_gridController.hasClients || !_state.hasMore) return;
    if (_gridController.position.extentAfter <
        TvDesignTokens.cardHeight * 1.5) {
      unawaited(_catalog.loadNext());
    }
  }

  @override
  void dispose() {
    _resetSelectHold();
    _catalog.removeListener(_catalogChanged);
    _catalog.dispose();
    _gridController
      ..removeListener(_scrollChanged)
      ..dispose();
    _footerNode
      ..removeListener(_refresh)
      ..dispose();
    for (final node in _itemNodes) {
      node.dispose();
    }
    super.dispose();
  }

  void _syncItemNodes(int itemCount) {
    while (_itemNodes.length > itemCount) {
      _itemNodes.removeLast().dispose();
    }
    while (_itemNodes.length < itemCount) {
      final index = _itemNodes.length;
      final node = FocusNode(debugLabel: 'tv-library-item-$index');
      node.addListener(() {
        if (node.hasFocus && mounted) {
          _focusedItemIndex = index;
          setState(() {});
          _prefetch(index);
        }
      });
      _itemNodes.add(node);
    }
  }

  void _prefetch(int index) {
    final distance = math.max(_columnCount, 4);
    if (_state.hasMore && index >= _state.items.length - distance) {
      unawaited(_catalog.loadNext());
    }
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (_isSelectKey(event.logicalKey)) {
      return _handleSelectKey(event)
          ? KeyEventResult.handled
          : KeyEventResult.ignored;
    }
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    _resetSelectHold();
    switch (event.logicalKey) {
      case LogicalKeyboardKey.arrowLeft:
        _moveHorizontal(-1);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowRight:
        _moveHorizontal(1);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowUp:
        _moveVertical(-1);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowDown:
        _moveVertical(1);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.escape:
      case LogicalKeyboardKey.goBack:
      case LogicalKeyboardKey.browserBack:
        unawaited(Navigator.of(context).maybePop());
        return KeyEventResult.handled;
      default:
        return KeyEventResult.ignored;
    }
  }

  bool _isSelectKey(LogicalKeyboardKey key) =>
      key == LogicalKeyboardKey.enter || key == LogicalKeyboardKey.select;

  bool _handleSelectKey(KeyEvent event) {
    final item = _focusedContextMedia();
    if (item == null) {
      if (event is KeyDownEvent) {
        _activate();
        return true;
      }
      return event is KeyUpEvent || event is KeyRepeatEvent;
    }
    if (event is KeyDownEvent) {
      if (_selectHoldTracking) return true;
      _selectHoldTracking = true;
      _selectHoldFired = false;
      _selectHoldMedia = item;
      _selectHoldTimer = Timer(const Duration(milliseconds: 560), () {
        final heldItem = _selectHoldMedia;
        if (!mounted || !_selectHoldTracking || heldItem == null) return;
        _selectHoldFired = true;
        _selectHoldTracking = false;
        _selectHoldMedia = null;
        _selectHoldTimer = null;
        unawaited(_openContextMenu(heldItem));
      });
      return true;
    }
    if (event is KeyRepeatEvent) return true;
    if (event is KeyUpEvent) {
      final fired = _selectHoldFired;
      _resetSelectHold();
      if (!fired) _activate();
      return true;
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
    if (_footerNode.hasFocus) return null;
    return _state.items.elementAtOrNull(_focusedItemIndex);
  }

  void _moveHorizontal(int delta) {
    if (_footerNode.hasFocus || _itemNodes.isEmpty) return;
    final current = _focusedItemIndex.clamp(0, _itemNodes.length - 1).toInt();
    final rowStart = (current ~/ _columnCount) * _columnCount;
    final rowEnd = math.min(rowStart + _columnCount - 1, _itemNodes.length - 1);
    _requestItemFocus((current + delta).clamp(rowStart, rowEnd).toInt());
  }

  void _moveVertical(int direction) {
    if (_footerNode.hasFocus) {
      if (direction < 0 && _itemNodes.isNotEmpty) {
        _requestItemFocus(_itemNodes.length - 1);
      }
      return;
    }
    if (_itemNodes.isEmpty) {
      if (_showFooter) _footerNode.requestFocus();
      return;
    }
    final target = _focusedItemIndex + direction * _columnCount;
    if (target >= 0 && target < _itemNodes.length) {
      _requestItemFocus(target);
    } else if (direction > 0 && _state.error != null) {
      _footerNode.requestFocus();
    } else if (direction > 0 && _state.hasMore && !_state.loadingMore) {
      unawaited(_catalog.loadNext());
    }
  }

  void _requestItemFocus(int index) {
    if (_itemNodes.isEmpty) return;
    final targetIndex = index.clamp(0, _itemNodes.length - 1).toInt();
    if (!_gridController.hasClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _requestItemFocus(targetIndex);
      });
      return;
    }
    final row = targetIndex ~/ _columnCount;
    final targetOffset =
        (row * (TvDesignTokens.cardHeight + TvDesignTokens.cardGap))
            .clamp(0, _gridController.position.maxScrollExtent)
            .toDouble();
    unawaited(
      _gridController
          .animateTo(
            targetOffset,
            duration: TvDesignTokens.focusAnimationDuration,
            curve: Curves.easeOutCubic,
          )
          .then((_) {
            if (mounted && _itemNodes[targetIndex].canRequestFocus) {
              _itemNodes[targetIndex].requestFocus();
            }
          }),
    );
  }

  void _activate() {
    if (_footerNode.hasFocus) {
      if (_state.error != null) unawaited(_catalog.retry());
      return;
    }
    final item = _state.items.elementAtOrNull(_focusedItemIndex);
    if (item == null) return;
    item.isSeries ? widget.onOpen(item) : widget.onPlay(item);
  }

  Future<void> _openContextMenu(MediaItem media) async {
    await showTvMediaContextMenu(
      context: context,
      api: widget.api,
      media: media,
      onOpen: (item) async => widget.onOpen(item),
      onPlay: (item, resumePositionMs) async {
        final positioned = widget.onPlayWithPosition;
        if (positioned != null) {
          await positioned(item, resumePositionMs);
        } else {
          widget.onPlay(item);
        }
      },
    );
    if (mounted && _itemNodes.isNotEmpty) {
      _itemNodes[_focusedItemIndex.clamp(0, _itemNodes.length - 1).toInt()]
          .requestFocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    final category = widget.category?.trim();
    return Scaffold(
      backgroundColor: const Color(0xFF040506),
      appBar: AppBar(
        toolbarHeight: 88,
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: const Color(0xFF040506),
        surfaceTintColor: Colors.transparent,
        leadingWidth: 76,
        leading: Padding(
          padding: const EdgeInsets.only(left: 22),
          child: IconButton(
            tooltip: 'Tilbage',
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back_rounded, size: 30),
          ),
        ),
        titleSpacing: 12,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              category == null || category.isEmpty
                  ? 'Alle ${widget.label.toLowerCase()}'
                  : '${widget.label} · $category',
              style: const TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w900,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              '${_state.total} titler  ·  A–Å',
              style: const TextStyle(
                color: Colors.white54,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment.topRight,
            radius: 1.2,
            colors: [Color(0x20332A1A), Color(0xFF040506)],
          ),
        ),
        child: Focus(
          canRequestFocus: true,
          onKeyEvent: _handleKey,
          child: Column(
            children: [
              Expanded(
                child: _state.loading && _state.items.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : LayoutBuilder(
                        builder: (context, constraints) {
                          _columnCount =
                              (constraints.maxWidth /
                                      (TvDesignTokens.cardWidth +
                                          TvDesignTokens.cardGap))
                                  .floor()
                                  .clamp(1, 10)
                                  .toInt();
                          return GridView.builder(
                            controller: _gridController,
                            padding: const EdgeInsets.all(
                              TvDesignTokens.pageHorizontalPadding,
                            ),
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: _columnCount,
                                  mainAxisExtent: TvDesignTokens.cardHeight,
                                  crossAxisSpacing: TvDesignTokens.cardGap,
                                  mainAxisSpacing: TvDesignTokens.cardGap,
                                ),
                            itemCount: _state.items.length,
                            itemBuilder: (_, index) => Center(
                              child: MediaPosterCard(
                                api: widget.api,
                                media: _state.items[index],
                                width: TvDesignTokens.cardWidth,
                                isTv: true,
                                focusNode: _itemNodes[index],
                                heroTag:
                                    'tv-library-${category ?? 'all'}-${_state.items[index].id}',
                                onPressed: () {
                                  _focusedItemIndex = index;
                                  _activate();
                                },
                                onLongPressed: () => unawaited(
                                  _openContextMenu(_state.items[index]),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
              if (_state.loadingMore)
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 10, 24, 22),
                  child: SizedBox(
                    width: 180,
                    child: LinearProgressIndicator(
                      minHeight: 3,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
              if (_state.error != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 8),
                  child: OutlinedButton.icon(
                    focusNode: _footerNode,
                    onPressed: _catalog.retry,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Prøv igen'),
                  ),
                ),
              if (_state.error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 18),
                  child: Text(
                    _state.error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
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
