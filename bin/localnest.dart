import 'dart:io';

import 'package:localnest/localnest.dart';
import 'package:localnest/src/models.dart';

Future<void> main(List<String> arguments) async {
  final options = _CliOptions.parse(arguments);
  if (options.helpRequested) {
    _printHelp();
    return;
  }

  if (options.errorMessage != null) {
    stderr.writeln('localnest: ${options.errorMessage}');
    stderr.writeln('Run `localnest --help` for usage.');
    exitCode = 64;
    return;
  }

  if (options.configInspectMode) {
    await _printConfigInfo(configPath: options.configPath);
    return;
  }

  if (options.setupMode) {
    await _runSetup(options);
    return;
  }

  if (options.doctorMode) {
    exitCode = await runLocalNestDoctor();
    return;
  }

  try {
    final server = LocalNestServer(configPath: options.configPath);
    await server.run();
  } on FormatException catch (error) {
    final targetConfigPath = options.configPath ?? _defaultConfigPath();
    stderr.writeln('localnest: ${error.message}');
    stderr.writeln('');
    stderr.writeln('Quick fix:');
    stderr.writeln(
      '  localnest --setup --root "${Directory.current.path}" --name "${_inferNameFromRoot(Directory.current.path)}" --config "$targetConfigPath"',
    );
    stderr.writeln('  localnest --doctor');
    exitCode = 1;
  } catch (error) {
    stderr.writeln('localnest fatal error: $error');
    exitCode = 1;
  }
}

Future<void> _runSetup(_CliOptions options) async {
  try {
    final resolvedRoot = options.setupRoot ?? Directory.current.path;
    final resolvedName = options.setupName ?? _inferNameFromRoot(resolvedRoot);

    final result = await setupLocalNest(
      configPath: options.configPath,
      projectName: resolvedName,
      projectRoot: resolvedRoot,
      splitProjects: options.splitProjects,
      enableVectorBootstrap: options.vectorBootstrap,
    );

    stdout.writeln('LocalNest setup complete.');
    stdout.writeln('Config: ${result.configPath}');
    stdout.writeln('Project: ${result.projectName} -> ${result.projectRoot}');
    stdout.writeln('');
    stdout.writeln('Next commands:');
    stdout.writeln('  localnest --doctor');
    stdout.writeln('  localnest --config ${result.configPath}');
    stdout.writeln('');
    stdout.writeln('MCP snippet:');
    stdout.writeln('{');
    stdout.writeln('  "mcpServers": {');
    stdout.writeln('    "localnest": {');
    stdout.writeln('      "command": "localnest",');
    stdout.writeln('      "args": ["--config", "${result.configPath}"]');
    stdout.writeln('    }');
    stdout.writeln('  }');
    stdout.writeln('}');
  } on ArgumentError catch (error) {
    stderr.writeln('localnest setup error: ${error.message}');
    stderr.writeln('');
    stderr.writeln('Setup examples:');
    stderr.writeln('  localnest --setup');
    stderr.writeln(
      '  localnest --setup --root /absolute/path/to/project --name project_alias',
    );
    exitCode = 64;
  } catch (error) {
    stderr.writeln('localnest setup failed: $error');
    exitCode = 1;
  }
}

Future<void> _printConfigInfo({String? configPath}) async {
  final resolvedPath = configPath ?? _defaultConfigPath();
  final file = File(resolvedPath);
  final exists = await file.exists();

  stdout.writeln('LocalNest config inspection');
  stdout.writeln('Config path: $resolvedPath');
  stdout.writeln('Exists: ${exists ? 'yes' : 'no'}');

  if (!exists) {
    stdout.writeln('');
    stdout.writeln('Create it with:');
    stdout.writeln(
      '  localnest --setup --root "${Directory.current.path}" --name "${_inferNameFromRoot(Directory.current.path)}" --config "$resolvedPath"',
    );
    return;
  }

  try {
    final loaded = await LocalNestConfig.load(configPath: resolvedPath);
    stdout.writeln('Status: valid');
    stdout.writeln('Projects: ${loaded.projects.length}');
    for (final project in loaded.projects) {
      stdout.writeln('  - ${project.name}: ${project.root}');
    }
  } on FormatException catch (error) {
    stdout.writeln('Status: invalid');
    stdout.writeln('Reason: ${error.message}');
    stdout.writeln('');
    stdout.writeln('Repair with:');
    stdout.writeln(
      '  localnest --setup --root "${Directory.current.path}" --name "${_inferNameFromRoot(Directory.current.path)}" --config "$resolvedPath"',
    );
  } catch (error) {
    stdout.writeln('Status: unreadable');
    stdout.writeln('Reason: $error');
  }
}

class _CliOptions {
  _CliOptions({
    required this.helpRequested,
    required this.setupMode,
    required this.doctorMode,
    required this.configInspectMode,
    required this.splitProjects,
    required this.vectorBootstrap,
    required this.configPath,
    required this.setupName,
    required this.setupRoot,
    this.errorMessage,
  });

  final bool helpRequested;
  final bool setupMode;
  final bool doctorMode;
  final bool configInspectMode;
  final bool splitProjects;
  final bool vectorBootstrap;
  final String? configPath;
  final String? setupName;
  final String? setupRoot;
  final String? errorMessage;

  static _CliOptions parse(List<String> arguments) {
    String? configPath;
    var configInspectMode = false;
    var setupMode = false;
    var doctorMode = false;
    var splitProjects = false;
    var vectorBootstrap = false;
    String? setupName;
    String? setupRoot;

    for (var i = 0; i < arguments.length; i++) {
      final arg = arguments[i];
      switch (arg) {
        case '--help':
        case '-h':
          return _CliOptions(
            helpRequested: true,
            setupMode: false,
            doctorMode: false,
            configInspectMode: false,
            splitProjects: false,
            vectorBootstrap: false,
            configPath: null,
            setupName: null,
            setupRoot: null,
          );
        case '--setup':
        case '--setup-quick':
          setupMode = true;
          break;
        case '--doctor':
          doctorMode = true;
          break;
        case '--split-projects':
          splitProjects = true;
          break;
        case '--enable-vector-bootstrap':
          vectorBootstrap = true;
          break;
        case '--config':
          if (i + 1 >= arguments.length) {
            configInspectMode = true;
            break;
          }
          final value = arguments[i + 1];
          if (value.startsWith('--')) {
            configInspectMode = true;
            break;
          }
          configPath = value;
          i += 1;
          break;
        case '--name':
          if (i + 1 >= arguments.length || arguments[i + 1].startsWith('--')) {
            return _error('--name requires a value');
          }
          setupName = arguments[i + 1];
          i += 1;
          break;
        case '--root':
          if (i + 1 >= arguments.length || arguments[i + 1].startsWith('--')) {
            return _error('--root requires a path');
          }
          setupRoot = arguments[i + 1];
          i += 1;
          break;
        default:
          if (arg.startsWith('--')) {
            return _error('unknown flag: $arg');
          }
          return _error('unexpected positional argument: $arg');
      }
    }

    final modeCount = [
      if (setupMode) 1,
      if (doctorMode) 1,
      if (configInspectMode) 1,
    ].length;
    if (modeCount > 1) {
      return _error(
        'choose only one mode: setup, doctor, or config inspection',
      );
    }

    if (setupName != null && !setupMode) {
      return _error('--name can only be used with --setup');
    }
    if (setupRoot != null && !setupMode) {
      return _error('--root can only be used with --setup');
    }
    if ((splitProjects || vectorBootstrap) && !setupMode) {
      return _error(
        '--split-projects and --enable-vector-bootstrap require --setup',
      );
    }

    return _CliOptions(
      helpRequested: false,
      setupMode: setupMode,
      doctorMode: doctorMode,
      configInspectMode: configInspectMode,
      splitProjects: splitProjects,
      vectorBootstrap: vectorBootstrap,
      configPath: configPath,
      setupName: setupName,
      setupRoot: setupRoot,
    );
  }

  static _CliOptions _error(String message) => _CliOptions(
    helpRequested: false,
    setupMode: false,
    doctorMode: false,
    configInspectMode: false,
    splitProjects: false,
    vectorBootstrap: false,
    configPath: null,
    setupName: null,
    setupRoot: null,
    errorMessage: message,
  );
}

String _inferNameFromRoot(String path) {
  final cleaned = path
      .replaceAll('\\', '/')
      .replaceAll(RegExp(r'/+$'), '')
      .trim();
  if (cleaned.isEmpty) return 'workspace';

  final parts = cleaned.split('/').where((part) => part.trim().isNotEmpty);
  if (parts.isEmpty) return 'workspace';
  final lastPart = parts.last.trim().toLowerCase();
  final normalized = lastPart
      .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
      .replaceAll(RegExp(r'^_+|_+$'), '');

  return normalized.isEmpty ? 'workspace' : normalized;
}

String _defaultConfigPath() {
  final home = Platform.environment['HOME'];
  if (home != null && home.isNotEmpty) {
    return '$home${Platform.pathSeparator}.localnest${Platform.pathSeparator}config.json';
  }
  return '${Directory.current.path}${Platform.pathSeparator}localnest.config.json';
}

void _printHelp() {
  stdout.writeln('LocalNest MCP server');
  stdout.writeln('');
  stdout.writeln('Quick start (recommended):');
  stdout.writeln('  localnest --setup');
  stdout.writeln('  localnest --doctor');
  stdout.writeln('  localnest --config');
  stdout.writeln('');
  stdout.writeln('Run server:');
  stdout.writeln('  localnest --config /absolute/path/to/config.json');
  stdout.writeln('');
  stdout.writeln('Setup variants:');
  stdout.writeln('  localnest --setup');
  stdout.writeln(
    '  localnest --setup --root /absolute/path/to/project --name project_alias',
  );
  stdout.writeln(
    '  localnest --setup --root /absolute/path/to/mono-root --name mono --split-projects',
  );
  stdout.writeln(
    '  localnest --setup --root /path --name alias --enable-vector-bootstrap',
  );
  stdout.writeln('');
  stdout.writeln('Health and diagnostics:');
  stdout.writeln('  localnest --doctor');
  stdout.writeln(
    '  localnest --config              # inspect default config path',
  );
  stdout.writeln(
    '  localnest --config /path/file   # inspect specific config if no other mode is set',
  );
  stdout.writeln('');
  stdout.writeln('Flags:');
  stdout.writeln('  --name <project-alias>      setup only');
  stdout.writeln('  --root <project-root>       setup only');
  stdout.writeln('  --split-projects            setup only');
  stdout.writeln('  --enable-vector-bootstrap   setup only');
  stdout.writeln('  --help, -h');
}
