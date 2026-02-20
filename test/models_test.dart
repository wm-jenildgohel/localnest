import 'dart:convert';
import 'dart:io';

import 'package:localnest/src/models.dart';
import 'package:test/test.dart';

void main() {
  group('LocalNestConfig', () {
    late Directory tempDir;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('localnest_models_');
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('loads tuning fields with clamping', () async {
      final appDir = Directory('${tempDir.path}/app')
        ..createSync(recursive: true);
      final cfgFile = File('${tempDir.path}/cfg.json');
      await cfgFile.writeAsString(
        jsonEncode({
          'projects': [
            {'name': 'app', 'root': appDir.path},
          ],
          'maxConcurrentSearches': 99,
          'searchTimeoutMs': 999999,
          'searchCacheTtlSeconds': -1,
          'searchCacheMaxEntries': 99999,
        }),
      );

      final cfg = await LocalNestConfig.load(configPath: cfgFile.path);
      expect(cfg.maxConcurrentSearches, 16);
      expect(cfg.searchTimeoutMs, 120000);
      expect(cfg.searchCacheTtlSeconds, 0);
      expect(cfg.searchCacheMaxEntries, 2000);
    });

    test('rejects overly broad root when allowBroadRoots false', () async {
      final cfgFile = File('${tempDir.path}/cfg2.json');
      await cfgFile.writeAsString(
        jsonEncode({
          'projects': [
            {'name': 'root', 'root': '/'},
          ],
        }),
      );

      expect(
        () => LocalNestConfig.load(configPath: cfgFile.path),
        throwsA(isA<FormatException>()),
      );
    });
  });
}
