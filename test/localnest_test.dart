import 'dart:io';

import 'package:localnest/src/models.dart';
import 'package:localnest/src/tools.dart';
import 'package:test/test.dart';

void main() {
  group('LocalNestTools', () {
    late Directory tempDir;
    late LocalNestTools tools;

    LocalNestConfig cfg({
      bool exposeProjectRoots = false,
      int searchCacheTtlSeconds = 20,
    }) {
      return LocalNestConfig(
        projects: [ProjectConfig(name: 'app', root: tempDir.path)],
        denyPatterns: const ['.env', 'secrets', 'node_modules/'],
        exposeProjectRoots: exposeProjectRoots,
        maxConcurrentSearches: 3,
        searchTimeoutMs: 8000,
        searchCacheTtlSeconds: searchCacheTtlSeconds,
        searchCacheMaxEntries: 200,
        allowBroadRoots: false,
      );
    }

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('localnest_test_');

      await Directory('${tempDir.path}/lib/src').create(recursive: true);
      await File('${tempDir.path}/lib/src/main.dart').writeAsString(
        'alpha\n'
        'beta\n'
        'gamma\n'
        'delta\n'
        'epsilon\n',
      );

      await Directory('${tempDir.path}/secrets').create(recursive: true);
      await File(
        '${tempDir.path}/secrets/.env',
      ).writeAsString('API_KEY=secret');

      tools = LocalNestTools(cfg());
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('list_projects hides root paths by default', () async {
      final result = await tools.callTool('list_projects', {});
      final structured = result['structuredContent'] as Map<String, dynamic>;
      final projects = structured['projects'] as List<dynamic>;
      final first = projects.first as Map<String, dynamic>;

      expect(first['name'], 'app');
      expect(first.containsKey('root'), isFalse);
      expect(structured['count'], 1);
    });

    test('list_projects can expose root paths when configured', () async {
      final exposed = LocalNestTools(cfg(exposeProjectRoots: true));

      final result = await exposed.callTool('list_projects', {});
      final structured = result['structuredContent'] as Map<String, dynamic>;
      final projects = structured['projects'] as List<dynamic>;
      final first = projects.first as Map<String, dynamic>;

      expect(first['name'], 'app');
      expect(first['root'], isNotEmpty);
    });

    test('search_code requires query', () async {
      final result = await tools.callTool('search_code', {'query': '   '});
      final structured = result['structuredContent'] as Map<String, dynamic>;

      expect(result['isError'], isTrue);
      expect(structured['error'], 'query is required');
    });

    test('search_code enforces query max length', () async {
      final result = await tools.callTool('search_code', {'query': 'a' * 300});
      final structured = result['structuredContent'] as Map<String, dynamic>;

      expect(result['isError'], isTrue);
      expect(structured['error'], contains('query too long'));
    });

    test('search_code validates unknown project filter first', () async {
      final result = await tools.callTool('search_code', {
        'query': 'alpha',
        'project': 'missing',
      });
      final structured = result['structuredContent'] as Map<String, dynamic>;

      expect(result['isError'], isTrue);
      expect(structured['error'], contains('No matching project'));
    });

    test('search_code returns cache hit on repeated query', () async {
      final first = await tools.callTool('search_code', {
        'query': 'alpha',
        'project': 'app',
        'maxResults': 5,
      });
      final firstStructured =
          first['structuredContent'] as Map<String, dynamic>;

      final second = await tools.callTool('search_code', {
        'query': 'alpha',
        'project': 'app',
        'maxResults': 5,
      });
      final secondStructured =
          second['structuredContent'] as Map<String, dynamic>;

      expect(first['isError'], isFalse);
      expect(second['isError'], isFalse);
      expect(firstStructured['meta']['cacheHit'], isFalse);
      expect(secondStructured['meta']['cacheHit'], isTrue);
    });

    test('get_file_snippet returns explicit line range', () async {
      final result = await tools.callTool('get_file_snippet', {
        'project': 'app',
        'path': 'lib/src/main.dart',
        'startLine': 2,
        'endLine': 3,
      });
      final structured = result['structuredContent'] as Map<String, dynamic>;
      final snippet = structured['snippet'] as String;

      expect(result['isError'], isFalse);
      expect(structured['startLine'], 2);
      expect(structured['endLine'], 3);
      expect(snippet, contains('2: beta'));
      expect(snippet, contains('3: gamma'));
      expect(snippet, isNot(contains('1: alpha')));
    });

    test('get_file_snippet supports aroundLine with context', () async {
      final result = await tools.callTool('get_file_snippet', {
        'project': 'app',
        'path': 'lib/src/main.dart',
        'aroundLine': 3,
        'contextLines': 1,
      });
      final structured = result['structuredContent'] as Map<String, dynamic>;

      expect(result['isError'], isFalse);
      expect(structured['startLine'], 2);
      expect(structured['endLine'], 4);
    });

    test('get_file_snippet blocks path traversal', () async {
      final result = await tools.callTool('get_file_snippet', {
        'project': 'app',
        'path': '../outside.txt',
      });
      final structured = result['structuredContent'] as Map<String, dynamic>;

      expect(result['isError'], isTrue);
      expect(structured['error'], contains('outside allowed root'));
    });

    test('get_file_snippet blocks denied paths', () async {
      final result = await tools.callTool('get_file_snippet', {
        'project': 'app',
        'path': 'secrets/.env',
      });
      final structured = result['structuredContent'] as Map<String, dynamic>;

      expect(result['isError'], isTrue);
      expect(structured['error'], contains('denied by security policy'));
    });

    test('get_repo_structure excludes denied entries', () async {
      final result = await tools.callTool('get_repo_structure', {
        'project': 'app',
        'maxDepth': 4,
      });
      final structured = result['structuredContent'] as Map<String, dynamic>;
      final entries = (structured['entries'] as List)
          .cast<Map<String, dynamic>>()
          .map((e) => e['path'] as String)
          .toList();

      expect(result['isError'], isFalse);
      expect(entries, contains('lib'));
      expect(entries, contains('lib/src/main.dart'));
      expect(entries.where((p) => p.contains('secrets')), isEmpty);
      expect(entries.where((p) => p.contains('.env')), isEmpty);
    });

    test('unknown tool returns error', () async {
      final result = await tools.callTool('invalid_tool', {});
      expect(result['isError'], isTrue);
    });
  });
}
