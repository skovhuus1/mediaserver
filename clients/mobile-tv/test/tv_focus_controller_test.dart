import 'package:boltbytes_media/src/tv/tv_focus_controller.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('TV focus traverses sparse rows without dead focus', (
    tester,
  ) async {
    final topNodes = List.generate(
      3,
      (index) => FocusNode(debugLabel: 'top-$index'),
    );
    final firstRow = List.generate(
      2,
      (index) => FocusNode(debugLabel: 'row-10-$index'),
    );
    final secondRow = [FocusNode(debugLabel: 'row-30-0')];
    final actionRow = List.generate(
      3,
      (index) => FocusNode(debugLabel: 'row-900-$index'),
    );
    final controller =
        TvFocusController(
          topRowNodes: topNodes,
          activeTopTab: 0,
          activeSection: -1,
          activeItem: 0,
        )..replaceSections({
          10: firstRow,
          30: secondRow,
          900: actionRow,
        }, notify: false);

    expect(controller.moveDown(), isTrue);
    expect(
      controller.state,
      const TvNavigationState(topTab: 0, sectionIndex: 10, itemIndex: 0),
    );
    expect(controller.moveRight(), isTrue);
    expect(controller.state.itemIndex, 1);
    expect(controller.moveRight(), isTrue);
    expect(controller.state.sectionIndex, 10);
    expect(controller.state.itemIndex, 1);
    expect(controller.moveDown(), isTrue);
    expect(controller.state.sectionIndex, 30);
    expect(controller.state.itemIndex, 0);
    expect(controller.moveDown(), isTrue);
    expect(controller.state.sectionIndex, 900);
    expect(controller.moveDown(), isTrue);
    expect(controller.state.sectionIndex, 900);
    expect(controller.moveUp(), isTrue);
    expect(controller.state.sectionIndex, 30);
    expect(controller.moveLeft(), isTrue);
    expect(controller.state.isTopRow, isTrue);

    await tester.pump();
    controller.dispose();
    for (final node in [...topNodes, ...firstRow, ...secondRow, ...actionRow]) {
      node.dispose();
    }
  });

  testWidgets('TV focus normalizes selection when a dynamic row disappears', (
    tester,
  ) async {
    final topNodes = [FocusNode(), FocusNode()];
    final resultNodes = [FocusNode(), FocusNode(), FocusNode()];
    final actionNodes = [FocusNode()];
    final controller = TvFocusController(
      topRowNodes: topNodes,
      activeTopTab: 1,
      activeSection: -1,
      activeItem: 0,
    )..replaceSections({20: resultNodes, 900: actionNodes}, notify: false);
    controller.setActive(topTab: 1, sectionIndex: 20, itemIndex: 2);

    controller.replaceSections({900: actionNodes}, notify: false);

    expect(
      controller.state,
      const TvNavigationState(topTab: 1, sectionIndex: 900, itemIndex: 0),
    );
    expect(controller.moveRight(), isTrue);
    expect(controller.state.itemIndex, 0);

    await tester.pump();
    controller.dispose();
    for (final node in [...topNodes, ...resultNodes, ...actionNodes]) {
      node.dispose();
    }
  });

  testWidgets('vertical TV navigation enters content to the right', (
    tester,
  ) async {
    final navigation = List.generate(3, (_) => FocusNode());
    final row = [FocusNode()];
    final controller = TvFocusController(
      topRowNodes: navigation,
      activeTopTab: 0,
      activeSection: -1,
      activeItem: 0,
      verticalNavigation: true,
    )..replaceSections({10: row}, notify: false);

    controller.moveDown();
    expect(controller.state.topTab, 1);
    controller.moveRight();
    expect(controller.state.sectionIndex, 10);
    controller.moveLeft();
    expect(controller.state.isTopRow, isTrue);

    await tester.pump();
    controller.dispose();
    for (final node in [...navigation, ...row]) {
      node.dispose();
    }
  });
}
