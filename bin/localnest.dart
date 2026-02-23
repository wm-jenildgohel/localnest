import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;

import 'package:localnest/localnest.dart';
import 'package:localnest/src/mcp_config_writer.dart';
import 'package:localnest/src/models.dart';
import 'package:localnest/src/update.dart';

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

  if (options.checkUpdateMode) {
    await _runCheckUpdate();
    return;
  }

  if (options.upgradeMode) {
    await _runUpgrade(options);
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

Future<void> _runCheckUpdate() async {
  final result = await checkForLocalNestUpdate();
  if (result == null) {
    stdout.writeln('Unable to check updates (network unavailable).');
    exitCode = 1;
    return;
  }

  stdout.writeln('Current: ${result.currentVersion}');
  stdout.writeln('Latest:  ${result.latestVersion}');
  stdout.writeln('Update available: ${result.hasUpdate ? 'yes' : 'no'}');
}

Future<void> _runUpgrade(_CliOptions options) async {
  final status = await checkForLocalNestUpdate();
  if (status == null) {
    stdout.writeln(
      'Update check unavailable; continuing with local MCP repair.',
    );
  } else {
    stdout.writeln('Current: ${status.currentVersion}');
    stdout.writeln('Latest:  ${status.latestVersion}');
  }

  var upgraded = false;
  if (status?.hasUpdate == true) {
    stdout.writeln('Running: dart pub global activate localnest');
    upgraded = await runSelfUpgrade();
    if (upgraded) {
      stdout.writeln('Upgrade complete.');
    } else {
      stdout.writeln('Upgrade failed. Continuing with config repair only.');
    }
  } else {
    stdout.writeln('Already on latest or update status unavailable.');
  }

  final resolvedConfigPath = await _resolveConfigPathForUpgrade(
    options.configPath,
  );
  final launch = await _resolveMcpLaunch(configPath: resolvedConfigPath);
  final targetPath = options.mcpFilePath?.trim().isNotEmpty == true
      ? options.mcpFilePath!.trim()
      : p.join(Directory.current.path, '.mcp.json');

  final backupPath = await _backupIfExists(targetPath);
  final mcpPath = await upsertMcpServerConfig(
    targetPath: targetPath,
    serverName: 'localnest',
    entry: McpServerEntry(
      command: launch.command,
      args: launch.args,
      env: {
        'DART_SUPPRESS_ANALYTICS': 'true',
        'LOCALNEST_CONFIG': resolvedConfigPath,
      },
    ),
  );

  stdout.writeln('MCP config repaired: $mcpPath');
  if (backupPath != null) {
    stdout.writeln('Backup created: $backupPath');
  }
  if (upgraded) {
    stdout.writeln('Restart MCP clients to load the updated server binary.');
  } else {
    stdout.writeln('Restart MCP clients to reload repaired config.');
  }
}

Future<void> _runSetup(_CliOptions options) async {
  try {
    final resolvedRoot = (options.setupRoot ?? '').trim().isEmpty
        ? Directory.current.path
        : options.setupRoot!.trim();
    final resolvedName = (options.setupName ?? '').trim().isEmpty
        ? _inferNameFromRoot(resolvedRoot)
        : options.setupName!.trim();

    final result = await setupLocalNest(
      configPath: options.configPath,
      projectName: resolvedName,
      projectRoot: resolvedRoot,
      flutterOnly: options.flutterOnly,
    );

    stdout.writeln('LocalNest setup complete.');
    stdout.writeln('Config: ${result.configPath}');
    stdout.writeln('Project: ${result.projectName} -> ${result.projectRoot}');
    stdout.writeln('');
    stdout.writeln('Next commands:');
    stdout.writeln('  localnest --doctor');
    stdout.writeln('  localnest --config ${result.configPath}');
    stdout.writeln('');

    final launch = await _resolveMcpLaunch(configPath: result.configPath);

    stdout.writeln('MCP snippet:');
    stdout.writeln('{');
    stdout.writeln('  "mcpServers": {');
    stdout.writeln('    "localnest": {');
    stdout.writeln('      "command": ${jsonEncode(launch.command)},');
    stdout.writeln('      "args": ${jsonEncode(launch.args)},');
    stdout.writeln(
      '      "env": ${jsonEncode({'DART_SUPPRESS_ANALYTICS': 'true', 'LOCALNEST_CONFIG': result.configPath})}',
    );
    stdout.writeln('    }');
    stdout.writeln('  }');
    stdout.writeln('}');
    if (launch.note != null) {
      stdout.writeln('');
      stdout.writeln('Note: ${launch.note}');
    }

    if (options.integrateMcp) {
      final mcpPath = await _writeMcpConfig(
        launch: launch,
        configPath: result.configPath,
        mcpFilePath: options.mcpFilePath,
      );
      stdout.writeln('');
      stdout.writeln('Integrated MCP config at: $mcpPath');
      stdout.writeln('Restart your MCP client to load updated server config.');
    }
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

Future<_McpLaunch> _resolveMcpLaunch({required String configPath}) async {
  final selfExecutable = Platform.resolvedExecutable;
  if (selfExecutable.isNotEmpty &&
      await File(selfExecutable).exists() &&
      !_looksLikeDartLauncher(selfExecutable)) {
    return _McpLaunch(
      command: selfExecutable,
      args: ['--config', configPath],
      note: 'Using current LocalNest executable.',
    );
  }

  final home =
      Platform.environment['HOME'] ?? Platform.environment['USERPROFILE'] ?? '';
  final globalPath = home.isEmpty
      ? null
      : (Platform.isWindows
            ? '$home\\AppData\\Local\\Pub\\Cache\\bin\\localnest.bat'
            : '$home/.pub-cache/bin/localnest');

  if (globalPath != null && await File(globalPath).exists()) {
    return _McpLaunch(
      command: globalPath,
      args: ['--config', configPath],
      note: 'Using globally installed LocalNest executable.',
    );
  }

  final sourceEntry = await _findSourceEntryPoint();
  if (sourceEntry != null) {
    final dartExecutable = await _resolveDartExecutable();
    return _McpLaunch(
      command: dartExecutable,
      args: ['run', sourceEntry, '--config', configPath],
      note: 'Global LocalNest binary not found; using source mode.',
    );
  }

  return _McpLaunch(
    command: 'localnest',
    args: ['--config', configPath],
    note:
        'Could not verify a global binary or source entrypoint. If startup fails in GUI apps, set an absolute command path.',
  );
}

bool _looksLikeDartLauncher(String executablePath) {
  final base = p.basename(executablePath).toLowerCase();
  return base == 'dart' || base == 'dart.exe';
}

Future<String> _resolveDartExecutable() async {
  final resolved = Platform.resolvedExecutable;
  if (resolved.isNotEmpty && await File(resolved).exists()) {
    return resolved;
  }
  return 'dart';
}

Future<String?> _findSourceEntryPoint() async {
  try {
    if (Platform.script.scheme != 'file') return null;
    final scriptPath = Platform.script.toFilePath();
    if (scriptPath.isEmpty) return null;

    final scriptFile = File(scriptPath);
    if (await scriptFile.exists() &&
        p.basename(scriptPath) == 'localnest.dart' &&
        p.basename(p.dirname(scriptPath)) == 'bin') {
      return p.normalize(scriptPath);
    }

    final cwdCandidate = p.join(
      Directory.current.path,
      'bin',
      'localnest.dart',
    );
    if (await File(cwdCandidate).exists()) {
      return p.normalize(cwdCandidate);
    }
  } catch (_) {
    // Keep setup resilient and fallback to generic command.
  }
  return null;
}

class _McpLaunch {
  _McpLaunch({required this.command, required this.args, this.note});

  final String command;
  final List<String> args;
  final String? note;
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
    required this.checkUpdateMode,
    required this.upgradeMode,
    required this.doctorMode,
    required this.configInspectMode,
    required this.integrateMcp,
    required this.flutterOnly,
    required this.configPath,
    required this.mcpFilePath,
    required this.setupName,
    required this.setupRoot,
    this.errorMessage,
  });

  final bool helpRequested;
  final bool setupMode;
  final bool checkUpdateMode;
  final bool upgradeMode;
  final bool doctorMode;
  final bool configInspectMode;
  final bool integrateMcp;
  final bool flutterOnly;
  final String? configPath;
  final String? mcpFilePath;
  final String? setupName;
  final String? setupRoot;
  final String? errorMessage;

  static _CliOptions parse(List<String> arguments) {
    String? configPath;
    var configInspectMode = false;
    var setupMode = false;
    var checkUpdateMode = false;
    var upgradeMode = false;
    var doctorMode = false;
    var integrateMcp = false;
    var flutterOnly = false;
    String? mcpFilePath;
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
            checkUpdateMode: false,
            upgradeMode: false,
            doctorMode: false,
            configInspectMode: false,
            integrateMcp: false,
            flutterOnly: false,
            configPath: null,
            mcpFilePath: null,
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
        case '--check-update':
          checkUpdateMode = true;
          break;
        case '--upgrade':
        case '--update':
          upgradeMode = true;
          break;
        case '--integrate':
        case '--install':
          integrateMcp = true;
          break;
        case '--flutter-only':
          flutterOnly = true;
          break;
        case '--mcp-file':
          if (i + 1 >= arguments.length || arguments[i + 1].startsWith('--')) {
            return _error('--mcp-file requires a path');
          }
          mcpFilePath = arguments[i + 1];
          i += 1;
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
      if (checkUpdateMode) 1,
      if (upgradeMode) 1,
      if (doctorMode) 1,
      if (configInspectMode) 1,
    ].length;
    if (modeCount > 1) {
      return _error(
        'choose only one mode: setup, check-update, upgrade, doctor, or config inspection',
      );
    }

    if (setupName != null && !setupMode) {
      return _error('--name can only be used with --setup');
    }
    if (setupRoot != null && !setupMode) {
      return _error('--root can only be used with --setup');
    }
    if (integrateMcp && !setupMode) {
      return _error('--integrate can only be used with --setup');
    }
    if (flutterOnly && !setupMode) {
      return _error('--flutter-only can only be used with --setup');
    }
    if (mcpFilePath != null && !(setupMode || upgradeMode)) {
      return _error('--mcp-file can only be used with --setup or --upgrade');
    }

    return _CliOptions(
      helpRequested: false,
      setupMode: setupMode,
      checkUpdateMode: checkUpdateMode,
      upgradeMode: upgradeMode,
      doctorMode: doctorMode,
      configInspectMode: configInspectMode,
      integrateMcp: integrateMcp,
      flutterOnly: flutterOnly,
      configPath: configPath,
      mcpFilePath: mcpFilePath,
      setupName: setupName,
      setupRoot: setupRoot,
    );
  }

  static _CliOptions _error(String message) => _CliOptions(
    helpRequested: false,
    setupMode: false,
    checkUpdateMode: false,
    upgradeMode: false,
    doctorMode: false,
    configInspectMode: false,
    integrateMcp: false,
    flutterOnly: false,
    configPath: null,
    mcpFilePath: null,
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

Future<String> _writeMcpConfig({
  required _McpLaunch launch,
  required String configPath,
  String? mcpFilePath,
}) async {
  final targetPath = mcpFilePath?.trim().isNotEmpty == true
      ? mcpFilePath!.trim()
      : p.join(Directory.current.path, '.mcp.json');
  return upsertMcpServerConfig(
    targetPath: targetPath,
    serverName: 'localnest',
    entry: McpServerEntry(
      command: launch.command,
      args: launch.args,
      env: {'DART_SUPPRESS_ANALYTICS': 'true', 'LOCALNEST_CONFIG': configPath},
    ),
  );
}

Future<String> _resolveConfigPathForUpgrade(String? configPath) async {
  if (configPath != null && configPath.trim().isNotEmpty) {
    return configPath.trim();
  }
  final envConfig = Platform.environment['LOCALNEST_CONFIG'];
  if (envConfig != null && envConfig.trim().isNotEmpty) {
    return envConfig.trim();
  }
  return _defaultConfigPath();
}

Future<String?> _backupIfExists(String filePath) async {
  final file = File(filePath);
  if (!await file.exists()) return null;

  final stamp = DateTime.now().toUtc().toIso8601String().replaceAll(':', '-');
  final backupPath = '$filePath.bak.$stamp';
  await file.copy(backupPath);
  return backupPath;
}

void _printHelp() {
  stdout.writeln('LocalNest MCP server');
  stdout.writeln('');
  stdout.writeln('Quick start (recommended):');
  stdout.writeln('  localnest --setup');
  stdout.writeln('  localnest --check-update');
  stdout.writeln('  localnest --upgrade');
  stdout.writeln('  localnest --doctor');
  stdout.writeln('  localnest --config');
  stdout.writeln('');
  stdout.writeln('Run server:');
  stdout.writeln('  localnest --config /absolute/path/to/config.json');
  stdout.writeln('');
  stdout.writeln('Setup variants:');
  stdout.writeln('  localnest --setup');
  stdout.writeln('  localnest --setup --integrate');
  stdout.writeln('  localnest --setup --flutter-only');
  stdout.writeln(
    '  localnest --setup --integrate --mcp-file /path/to/.mcp.json',
  );
  stdout.writeln(
    '  localnest --setup --root /absolute/path/to/project --name project_alias',
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
  stdout.writeln(
    '  --integrate, --install      setup only; writes MCP client config',
  );
  stdout.writeln(
    '  --flutter-only              setup only; discover only Flutter projects',
  );
  stdout.writeln(
    '  --mcp-file <path>           setup/upgrade target MCP JSON file',
  );
  stdout.writeln(
    '  --check-update              check latest version on pub.dev',
  );
  stdout.writeln(
    '  --upgrade, --update         self-update and repair MCP config',
  );
  stdout.writeln('  --config <path>             used by inspect/setup/upgrade');
  stdout.writeln('  --help, -h');
}
