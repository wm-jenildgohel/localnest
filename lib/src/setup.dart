import 'dart:convert';
import 'dart:io';

class SetupResult {
  const SetupResult({
    required this.configPath,
    required this.projectName,
    required this.projectRoot,
  });

  final String configPath;
  final String projectName;
  final String projectRoot;
}

Future<SetupResult> setupLocalNest({
  String? configPath,
  required String projectName,
  required String projectRoot,
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
  var replaced = false;
  for (var i = 0; i < projects.length; i++) {
    final item = projects[i];
    if (item['name'] == normalizedName) {
      projects[i] = {'name': normalizedName, 'root': resolvedRoot};
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    projects.add({'name': normalizedName, 'root': resolvedRoot});
  }
  json['projects'] = projects;

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
