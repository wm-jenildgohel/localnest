import 'models.dart';
import 'mcp_stdio_server.dart';
import 'tools.dart';

/// Runs LocalNest as an MCP stdio server using the provided configuration.
class LocalNestServer {
  /// Creates a LocalNest server.
  ///
  /// If [configPath] is null, default config lookup rules are used.
  LocalNestServer({required this.configPath});

  /// Optional path to `localnest.config.json`.
  final String? configPath;

  /// Loads config and starts serving MCP requests over stdio.
  Future<void> run() async {
    final config = await LocalNestConfig.load(configPath: configPath);
    final tools = LocalNestTools(config);
    final server = McpStdioServer(executor: _ToolExecutorAdapter(tools));
    await server.serve();
  }
}

class _ToolExecutorAdapter implements ToolExecutor {
  _ToolExecutorAdapter(this._tools);

  final LocalNestTools _tools;

  @override
  Future<Map<String, dynamic>> runTool(String name, Map<String, dynamic> args) {
    return _tools.callTool(name, args);
  }

  @override
  Map<String, dynamic> toolsListPayload() {
    return _tools.listToolsSchema();
  }
}
