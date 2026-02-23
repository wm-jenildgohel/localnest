import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;

class McpServerEntry {
  const McpServerEntry({required this.command, required this.args, this.env});

  final String command;
  final List<String> args;
  final Map<String, String>? env;
}

Future<String> upsertMcpServerConfig({
  required String targetPath,
  required String serverName,
  required McpServerEntry entry,
}) async {
  final file = File(targetPath);
  await file.parent.create(recursive: true);

  Map<String, dynamic> root = <String, dynamic>{};
  if (await file.exists()) {
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is Map<String, dynamic>) {
        root = Map<String, dynamic>.from(decoded);
      }
    } catch (_) {
      root = <String, dynamic>{};
    }
  }

  final currentServers = root['mcpServers'];
  final servers = currentServers is Map<String, dynamic>
      ? Map<String, dynamic>.from(currentServers)
      : <String, dynamic>{};

  final serverPayload = <String, dynamic>{
    'command': entry.command,
    'args': entry.args,
  };
  if (entry.env != null && entry.env!.isNotEmpty) {
    serverPayload['env'] = entry.env;
  }
  servers[serverName] = serverPayload;
  root['mcpServers'] = servers;

  final pretty = const JsonEncoder.withIndent('  ').convert(root);
  await file.writeAsString('$pretty\n');
  return p.normalize(file.path);
}
