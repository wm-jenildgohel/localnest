import 'dart:convert';
import 'dart:io';

import 'package:localnest/src/setup.dart';
import 'package:test/test.dart';

void main() {
  group('setupLocalNest', () {
    late Directory tempDir;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('localnest_setup_');
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('creates config with defaults and project', () async {
      final projectDir = Directory('${tempDir.path}/project')
        ..createSync(recursive: true);
      final configPath = '${tempDir.path}/config.json';

      final result = await setupLocalNest(
        configPath: configPath,
        projectName: 'app',
        projectRoot: projectDir.path,
      );

      expect(result.configPath, configPath);
      final data =
          jsonDecode(await File(configPath).readAsString())
              as Map<String, dynamic>;
      expect(data['projects'], isA<List>());
      final projects = (data['projects'] as List).cast<Map<String, dynamic>>();
      expect(projects.any((p) => p['name'] == 'app'), isTrue);
      expect(data['maxConcurrentSearches'], 4);
      expect(data['searchTimeoutMs'], 8000);
      expect(data['searchCacheTtlSeconds'], 20);
      expect(data['searchCacheMaxEntries'], 200);
    });

    test('updates existing project by name', () async {
      final projectDir1 = Directory('${tempDir.path}/project1')
        ..createSync(recursive: true);
      final projectDir2 = Directory('${tempDir.path}/project2')
        ..createSync(recursive: true);
      final configPath = '${tempDir.path}/config2.json';

      await setupLocalNest(
        configPath: configPath,
        projectName: 'app',
        projectRoot: projectDir1.path,
      );
      await setupLocalNest(
        configPath: configPath,
        projectName: 'app',
        projectRoot: projectDir2.path,
      );

      final data =
          jsonDecode(await File(configPath).readAsString())
              as Map<String, dynamic>;
      final projects = (data['projects'] as List).cast<Map<String, dynamic>>();
      expect(projects.length, 1);
      expect(projects.first['name'], 'app');
      expect((projects.first['root'] as String).contains('project2'), isTrue);
    });

    test('split-projects discovery and vector bootstrap', () async {
      final flutterA = Directory('${tempDir.path}/Flutter/app_a')
        ..createSync(recursive: true);
      final flutterB = Directory('${tempDir.path}/Flutter/app_b')
        ..createSync(recursive: true);
      File('${flutterA.path}/pubspec.yaml').writeAsStringSync('name: a');
      File('${flutterB.path}/pubspec.yaml').writeAsStringSync('name: b');

      final configPath = '${tempDir.path}/config_split.json';
      await setupLocalNest(
        configPath: configPath,
        projectName: 'flutter',
        projectRoot: '${tempDir.path}/Flutter',
        splitProjects: true,
        enableVectorBootstrap: true,
      );

      final data =
          jsonDecode(await File(configPath).readAsString())
              as Map<String, dynamic>;
      final projects = (data['projects'] as List).cast<Map<String, dynamic>>();
      expect(
        projects.any((p) => '${p['name']}'.startsWith('flutter_')),
        isTrue,
      );
      expect(data['vector']['enabled'], isTrue);
    });

    test('throws for missing root', () async {
      final configPath = '${tempDir.path}/config3.json';
      expect(
        () => setupLocalNest(
          configPath: configPath,
          projectName: 'app',
          projectRoot: '${tempDir.path}/missing',
        ),
        throwsA(isA<ArgumentError>()),
      );
    });
  });
}
