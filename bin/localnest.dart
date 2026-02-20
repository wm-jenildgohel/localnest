import 'dart:io';

import 'package:localnest/localnest.dart';

Future<void> main(List<String> arguments) async {
  String? configPath;
  var setupMode = false;
  var doctorMode = false;
  String? setupName;
  String? setupRoot;

  for (var i = 0; i < arguments.length; i++) {
    final arg = arguments[i];
    if (arg == '--config' && i + 1 < arguments.length) {
      configPath = arguments[i + 1];
      i += 1;
      continue;
    }
    if (arg == '--setup') {
      setupMode = true;
      continue;
    }
    if (arg == '--doctor') {
      doctorMode = true;
      continue;
    }
    if (arg == '--name' && i + 1 < arguments.length) {
      setupName = arguments[i + 1];
      i += 1;
      continue;
    }
    if (arg == '--root' && i + 1 < arguments.length) {
      setupRoot = arguments[i + 1];
      i += 1;
      continue;
    }
    if (arg == '--help' || arg == '-h') {
      _printHelp();
      return;
    }
  }

  try {
    if (setupMode) {
      final resolvedRoot = setupRoot ?? Directory.current.path;
      final resolvedName = setupName ?? 'workspace';
      final result = await setupLocalNest(
        configPath: configPath,
        projectName: resolvedName,
        projectRoot: resolvedRoot,
      );

      stdout.writeln('LocalNest setup complete.');
      stdout.writeln('Config: ${result.configPath}');
      stdout.writeln('Project: ${result.projectName} -> ${result.projectRoot}');
      stdout.writeln('');
      stdout.writeln('MCP snippet:');
      stdout.writeln('{');
      stdout.writeln('  "mcpServers": {');
      stdout.writeln('    "localnest": {');
      stdout.writeln(
        '      "command": "/absolute/path/to/localnest/build/localnest",',
      );
      stdout.writeln('      "args": ["--config", "${result.configPath}"]');
      stdout.writeln('    }');
      stdout.writeln('  }');
      stdout.writeln('}');
      return;
    }

    if (doctorMode) {
      exitCode = await runLocalNestDoctor();
      return;
    }

    final server = LocalNestServer(configPath: configPath);
    await server.run();
  } catch (e, st) {
    stderr.writeln('localnest fatal error: $e');
    stderr.writeln(st);
    exitCode = 1;
  }
}

void _printHelp() {
  stdout.writeln('LocalNest MCP server');
  stdout.writeln(
    'Usage: localnest --config /absolute/path/localnest.config.json',
  );
  stdout.writeln(
    '   or: dart run localnest --config /absolute/path/localnest.config.json',
  );
  stdout.writeln('');
  stdout.writeln('Quick setup:');
  stdout.writeln(
    '  localnest --setup --name scripts --root /absolute/path/to/Scripts',
  );
  stdout.writeln('Environment check:');
  stdout.writeln('  localnest --doctor');
  stdout.writeln('Optional flags:');
  stdout.writeln('  --config /absolute/path/to/config.json');
  stdout.writeln('  --name <project-name> (default: workspace)');
  stdout.writeln('  --root <project-root> (default: current directory)');
}
