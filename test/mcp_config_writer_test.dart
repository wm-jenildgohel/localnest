import 'dart:convert';
import 'dart:io';

import 'package:localnest/src/mcp_config_writer.dart';
import 'package:test/test.dart';

void main() {
  group('upsertMcpServerConfig', () {
    late Directory tempDir;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('localnest_mcp_cfg_');
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('creates file and writes localnest server', () async {
      final path = '${tempDir.path}/.mcp.json';
      await upsertMcpServerConfig(
        targetPath: path,
        serverName: 'localnest',
        entry: const McpServerEntry(
          command: '/abs/localnest',
          args: ['--config', '/tmp/localnest.config.json'],
          env: {'DART_SUPPRESS_ANALYTICS': 'true'},
        ),
      );

      final data =
          jsonDecode(await File(path).readAsString()) as Map<String, dynamic>;
      final servers = data['mcpServers'] as Map<String, dynamic>;
      final localnest = servers['localnest'] as Map<String, dynamic>;

      expect(localnest['command'], '/abs/localnest');
      expect((localnest['args'] as List).isNotEmpty, isTrue);
      expect(localnest['env']['DART_SUPPRESS_ANALYTICS'], 'true');
    });

    test('merges without removing other servers', () async {
      final path = '${tempDir.path}/.mcp.json';
      await File(path).writeAsString(
        jsonEncode({
          'mcpServers': {
            'other': {
              'command': 'npx',
              'args': ['-y', 'x'],
            },
          },
        }),
      );

      await upsertMcpServerConfig(
        targetPath: path,
        serverName: 'localnest',
        entry: const McpServerEntry(
          command: 'localnest',
          args: ['--config', 'x'],
        ),
      );

      final data =
          jsonDecode(await File(path).readAsString()) as Map<String, dynamic>;
      final servers = data['mcpServers'] as Map<String, dynamic>;

      expect(servers.containsKey('other'), isTrue);
      expect(servers.containsKey('localnest'), isTrue);
    });
  });
}
