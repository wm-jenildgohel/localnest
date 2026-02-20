import 'models.dart';
import 'mcp_stdio_server.dart';
import 'tools.dart';

class LocalNestServer {
  LocalNestServer({required this.configPath});

  final String? configPath;

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
