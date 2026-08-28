import 'dart:io';

import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/tv/widgets/tv_motion_preview.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(_loadPreviewFonts);

  testWidgets('writes 13-focus-motion-preview.png', (tester) async {
    await tester.binding.setSurfaceSize(const Size(1280, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const media = MediaItem(
      id: 'preview-dna',
      title: 'DNA',
      type: 'series',
      releaseYear: 2026,
      overview: 'Et nyt lag af levende indhold uden at starte en stream.',
      width: 3840,
      height: 2160,
      hdr: 'HDR10',
    );
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          brightness: Brightness.dark,
          fontFamily: 'sans-serif-condensed',
          scaffoldBackgroundColor: Colors.transparent,
        ),
        home: Scaffold(body: _PreviewStage(media: media)),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 650));
    await expectLater(
      find.byType(_PreviewStage),
      matchesGoldenFile('goldens/13-focus-motion-preview.png'),
    );
  });
}

Future<void> _loadPreviewFonts() async {
  if (!Platform.isWindows) return;
  await _loadFontFamily(
    'sans-serif-condensed',
    r'C:\Windows\Fonts\segoeui.ttf',
  );
  await _loadFontFamily('sans-serif', r'C:\Windows\Fonts\segoeui.ttf');
  final where = await Process.run('where.exe', ['flutter']);
  if (where.exitCode != 0) return;
  final flutterPath = (where.stdout as String)
      .split(RegExp(r'[\r\n]+'))
      .map((value) => value.trim())
      .where((value) => value.isNotEmpty)
      .firstOrNull;
  if (flutterPath == null) return;
  final flutterBin = File(flutterPath).parent.path;
  await _loadFontFamily(
    'MaterialIcons',
    '$flutterBin${Platform.pathSeparator}cache${Platform.pathSeparator}'
        'artifacts${Platform.pathSeparator}material_fonts'
        '${Platform.pathSeparator}MaterialIcons-Regular.otf',
  );
}

Future<void> _loadFontFamily(String family, String path) async {
  final file = File(path);
  if (!file.existsSync()) return;
  final bytes = file.readAsBytesSync();
  await (FontLoader(
    family,
  )..addFont(Future.value(ByteData.sublistView(bytes)))).load();
}

class _PreviewStage extends StatelessWidget {
  const _PreviewStage({required this.media});

  final MediaItem media;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFF030507),
      child: Stack(
        children: [
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment(0.38, -0.28),
                  radius: 1.12,
                  colors: [
                    Color(0xFF142635),
                    Color(0xFF080C11),
                    Color(0xFF030507),
                  ],
                ),
              ),
            ),
          ),
          const Positioned(
            left: 42,
            top: 34,
            child: Text(
              'BOLTBYTES  /  NÆSTE NIVEAU',
              style: TextStyle(
                color: Color(0xFFFFD978),
                fontSize: 13,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.7,
              ),
            ),
          ),
          const Positioned(
            left: 42,
            top: 126,
            width: 420,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'DNA',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 58,
                    height: 0.94,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -2.4,
                  ),
                ),
                SizedBox(height: 16),
                Text(
                  '2026  ·  4K  ·  HDR',
                  style: TextStyle(
                    color: Color(0xFFB4C0CA),
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 18),
                Text(
                  'Hold fokus et øjeblik. Artwork bliver levende med serverens seek-preview – uden buffering, lyd eller afspilningssession.',
                  style: TextStyle(
                    color: Color(0xFFD5DCE2),
                    fontSize: 16,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            left: 536,
            top: 145,
            width: 640,
            height: 360,
            child: TvMotionPreviewChrome(
              media: media,
              motion: true,
              frame: const _PreviewFixtureFrame(),
            ),
          ),
          Positioned(
            left: 536,
            top: 526,
            child: Row(
              children: const [
                _Hint(label: 'OK', text: 'Åbn titel'),
                SizedBox(width: 10),
                _Hint(label: 'HOLD OK', text: 'Flere handlinger'),
                SizedBox(width: 10),
                _Hint(label: '← →', text: 'Skift titel'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewFixtureFrame extends StatelessWidget {
  const _PreviewFixtureFrame();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF234657), Color(0xFF0C1720), Color(0xFF3B2814)],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: 58,
            top: 34,
            child: Container(
              width: 238,
              height: 238,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF53D8FF).withValues(alpha: 0.42),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          const Positioned(
            right: 92,
            top: 58,
            child: Icon(
              Icons.play_circle_outline_rounded,
              color: Color(0xCCFFFFFF),
              size: 132,
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: 5,
            child: ColoredBox(
              color: const Color(0xFFFFD978).withValues(alpha: 0.72),
            ),
          ),
        ],
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.label, required this.text});

  final String label;
  final String text;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xC911171E),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0x334A5662)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: const TextStyle(
                color: Color(0xFFFFD978),
                fontSize: 10,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(width: 7),
            Text(
              text,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
