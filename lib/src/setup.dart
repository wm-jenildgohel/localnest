import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;

/// Result of running the LocalNest setup helper.
class SetupResult {
  /// Creates a setup result.
  const SetupResult({
    required this.configPath,
    required this.projectName,
    required this.projectRoot,
  });

  /// Absolute path to the generated/updated config file.
  final String configPath;

  /// Project alias written to config.
  final String projectName;

  /// Absolute root path written to config.
  final String projectRoot;
}

/// Creates or updates a LocalNest config and registers a project root.
///
/// Use [splitProjects] to auto-discover subprojects under [projectRoot].
/// Use [enableVectorBootstrap] to include vector integration placeholders.
Future<SetupResult> setupLocalNest({
  String? configPath,
  required String projectName,
  required String projectRoot,
  bool splitProjects = true,
  bool flutterOnly = false,
  int maxDiscoveredProjects = 150,
  bool enableVectorBootstrap = true,
}) async {
  final normalizedName = projectName.trim();
  if (normalizedName.isEmpty) {
    throw ArgumentError('projectName must not be empty');
  }

  final rootDir = Directory(projectRoot);
  if (!await rootDir.exists()) {
    throw ArgumentError('projectRoot does not exist: $projectRoot');
  }
  final resolvedRoot = await rootDir.resolveSymbolicLinks();

  final finalConfigPath = await _resolveConfigPath(configPath);
  final file = File(finalConfigPath);
  await file.parent.create(recursive: true);

  Map<String, dynamic> json = <String, dynamic>{};
  if (await file.exists()) {
    try {
      final parsed = jsonDecode(await file.readAsString());
      if (parsed is Map<String, dynamic>) {
        json = Map<String, dynamic>.from(parsed);
      }
    } catch (_) {
      json = <String, dynamic>{};
    }
  }

  json['exposeProjectRoots'] = json['exposeProjectRoots'] == true;
  json['allowBroadRoots'] = json['allowBroadRoots'] == true;
  json['maxConcurrentSearches'] = _normalizeInt(
    json['maxConcurrentSearches'],
    fallback: 4,
    min: 1,
    max: 16,
  );
  json['searchTimeoutMs'] = _normalizeInt(
    json['searchTimeoutMs'],
    fallback: 8000,
    min: 500,
    max: 120000,
  );
  json['searchCacheTtlSeconds'] = _normalizeInt(
    json['searchCacheTtlSeconds'],
    fallback: 20,
    min: 0,
    max: 3600,
  );
  json['searchCacheMaxEntries'] = _normalizeInt(
    json['searchCacheMaxEntries'],
    fallback: 200,
    min: 1,
    max: 2000,
  );

  final deny = _normalizeDenyPatterns(json['denyPatterns']);
  json['denyPatterns'] = deny;

  final projects = _normalizeProjects(json['projects']);
  if (splitProjects) {
    final discovered = await _discoverProjectRoots(
      parentRoot: resolvedRoot,
      maxProjects: maxDiscoveredProjects,
      flutterOnly: flutterOnly,
    );
    for (final d in discovered) {
      final name = '${normalizedName}_${_sanitizeName(d.name)}';
      _upsertProject(projects, name: name, root: d.root);
    }
    if (discovered.isEmpty) {
      _upsertProject(projects, name: normalizedName, root: resolvedRoot);
    }
  } else {
    _upsertProject(projects, name: normalizedName, root: resolvedRoot);
  }
  json['projects'] = projects;

  if (enableVectorBootstrap) {
    json['vector'] = {
      'enabled': true,
      'provider': 'qdrant',
      'url': 'http://127.0.0.1:6333',
      'collection': 'localnest',
      'embedding': {
        'provider': 'ollama',
        'model': 'nomic-embed-text',
        'url': 'http://127.0.0.1:11434',
      },
    };
  } else if (json['vector'] == null) {
    json['vector'] = {'enabled': false};
  }

  final out = const JsonEncoder.withIndent('  ').convert(json);
  await file.writeAsString('$out\n');

  return SetupResult(
    configPath: finalConfigPath,
    projectName: normalizedName,
    projectRoot: resolvedRoot,
  );
}

Future<String> _resolveConfigPath(String? configured) async {
  if (configured != null && configured.trim().isNotEmpty) {
    return configured;
  }
  final home = Platform.environment['HOME'];
  if (home != null && home.isNotEmpty) {
    return '$home${Platform.pathSeparator}.localnest${Platform.pathSeparator}config.json';
  }
  return '${Directory.current.path}${Platform.pathSeparator}localnest.config.json';
}

int _normalizeInt(
  dynamic value, {
  required int fallback,
  required int min,
  required int max,
}) {
  final parsed = value is int ? value : int.tryParse('${value ?? ''}');
  final out = parsed ?? fallback;
  if (out < min) return min;
  if (out > max) return max;
  return out;
}

void _upsertProject(
  List<Map<String, String>> projects, {
  required String name,
  required String root,
}) {
  for (var i = 0; i < projects.length; i++) {
    if (projects[i]['name'] == name) {
      projects[i] = {'name': name, 'root': root};
      return;
    }
  }
  projects.add({'name': name, 'root': root});
}

String _sanitizeName(String value) {
  final cleaned = value
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
      .replaceAll(RegExp(r'^_+|_+$'), '');
  return cleaned.isEmpty ? 'project' : cleaned;
}

Future<List<({String name, String root})>> _discoverProjectRoots({
  required String parentRoot,
  required int maxProjects,
  required bool flutterOnly,
}) async {
  final found = <({String name, String root})>[];
  final queue = <Directory>[Directory(parentRoot)];
  final visited = <String>{};

  while (queue.isNotEmpty && found.length < maxProjects) {
    final dir = queue.removeAt(0);
    String resolved;
    try {
      resolved = await dir.resolveSymbolicLinks();
    } catch (_) {
      continue;
    }
    if (!visited.add(resolved)) continue;

    final hasPubspec = await File(
      '$resolved${Platform.pathSeparator}pubspec.yaml',
    ).exists();
    final hasFlutterMarker = hasPubspec && await _isFlutterProject(resolved);
    final hasGenericMarker =
        hasPubspec ||
        await File('$resolved${Platform.pathSeparator}package.json').exists() ||
        await Directory('$resolved${Platform.pathSeparator}.git').exists();
    final hasMarker = flutterOnly ? hasFlutterMarker : hasGenericMarker;

    if (hasMarker && resolved != parentRoot) {
      found.add((name: p.basename(resolved), root: resolved));
      continue;
    }

    try {
      await for (final entity in dir.list(followLinks: false)) {
        if (entity is! Directory) continue;
        final base = p.basename(entity.path).toLowerCase();
        if (base == '.git' ||
            base == 'node_modules' ||
            base == 'build' ||
            base == 'dist') {
          continue;
        }
        queue.add(entity);
      }
    } catch (_) {
      // Ignore unreadable directory segments during discovery.
    }
  }

  return found;
}

Future<bool> _isFlutterProject(String root) async {
  final pubspec = File('$root${Platform.pathSeparator}pubspec.yaml');
  if (!await pubspec.exists()) return false;
  try {
    final content = await pubspec.readAsString();
    return RegExp(r'^\s*flutter\s*:', multiLine: true).hasMatch(content);
  } catch (_) {
    return false;
  }
}

List<String> _normalizeDenyPatterns(dynamic value) {
  const defaults = <String>[
    '.env',
    '.env.',
    'id_rsa',
    '.pem',
    '.p12',
    '.key',
    '.jks',
    '.keystore',
    'node_modules/',
    '.git/',
    'build/',
    'dist/',
    'coverage/',
  ];

  final out = <String>[...defaults];
  if (value is List) {
    for (final item in value) {
      final x = item.toString().trim();
      if (x.isNotEmpty && !out.contains(x)) out.add(x);
    }
  }
  return out;
}

List<Map<String, String>> _normalizeProjects(dynamic value) {
  final out = <Map<String, String>>[];
  if (value is List) {
    for (final item in value) {
      if (item is! Map) continue;
      final name = '${item['name'] ?? ''}'.trim();
      final root = '${item['root'] ?? ''}'.trim();
      if (name.isEmpty || root.isEmpty) continue;
      out.add({'name': name, 'root': root});
    }
  }
  return out;
}
