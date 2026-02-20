import 'dart:convert';
import 'dart:io';

class ProjectConfig {
  const ProjectConfig({required this.name, required this.root});

  final String name;
  final String root;

  Map<String, Object?> toJson() => {'name': name, 'root': root};
}

class LocalNestConfig {
  const LocalNestConfig({
    required this.projects,
    required this.denyPatterns,
    required this.exposeProjectRoots,
    required this.maxConcurrentSearches,
    required this.searchTimeoutMs,
    required this.searchCacheTtlSeconds,
    required this.searchCacheMaxEntries,
    required this.allowBroadRoots,
  });

  final List<ProjectConfig> projects;
  final List<Pattern> denyPatterns;
  final bool exposeProjectRoots;
  final int maxConcurrentSearches;
  final int searchTimeoutMs;
  final int searchCacheTtlSeconds;
  final int searchCacheMaxEntries;
  final bool allowBroadRoots;

  static Future<LocalNestConfig> load({String? configPath}) async {
    final resolvedPath = configPath ?? Platform.environment['LOCALNEST_CONFIG'];

    if (resolvedPath != null && resolvedPath.trim().isNotEmpty) {
      return _loadFromFile(File(resolvedPath));
    }

    final cwdFile = File(
      '${Directory.current.path}${Platform.pathSeparator}localnest.config.json',
    );
    if (await cwdFile.exists()) {
      return _loadFromFile(cwdFile);
    }

    final home = Platform.environment['HOME'];
    if (home != null && home.isNotEmpty) {
      final homeFile = File(
        '$home${Platform.pathSeparator}.localnest${Platform.pathSeparator}config.json',
      );
      if (await homeFile.exists()) {
        return _loadFromFile(homeFile);
      }
    }

    final fallbackRoot = await Directory.current.resolveSymbolicLinks();
    return LocalNestConfig(
      projects: [ProjectConfig(name: 'default', root: fallbackRoot)],
      denyPatterns: _defaultDenyPatterns(),
      exposeProjectRoots: false,
      maxConcurrentSearches: 3,
      searchTimeoutMs: 8000,
      searchCacheTtlSeconds: 20,
      searchCacheMaxEntries: 200,
      allowBroadRoots: false,
    );
  }

  static Future<LocalNestConfig> _loadFromFile(File file) async {
    final raw = await file.readAsString();
    final json = jsonDecode(raw);

    if (json is! Map<String, dynamic>) {
      throw FormatException('Config root must be an object: ${file.path}');
    }

    final rawProjects = json['projects'];
    if (rawProjects is! List || rawProjects.isEmpty) {
      throw FormatException(
        'Config must include non-empty "projects" array: ${file.path}',
      );
    }

    final projects = <ProjectConfig>[];
    for (final item in rawProjects) {
      if (item is! Map<String, dynamic>) continue;
      final name = (item['name'] ?? '').toString().trim();
      final root = (item['root'] ?? '').toString().trim();
      if (name.isEmpty || root.isEmpty) continue;

      final rootDir = Directory(root);
      if (!await rootDir.exists()) continue;
      final resolvedRoot = await rootDir.resolveSymbolicLinks();
      if (!_isSafeRoot(
        resolvedRoot,
        allowBroadRoots: json['allowBroadRoots'] == true,
      )) {
        continue;
      }
      projects.add(ProjectConfig(name: name, root: resolvedRoot));
    }

    if (projects.isEmpty) {
      throw FormatException('No valid projects found in config: ${file.path}');
    }

    final denyPatterns = <Pattern>[..._defaultDenyPatterns()];
    final userDeny = json['denyPatterns'];
    if (userDeny is List) {
      for (final pattern in userDeny) {
        final value = pattern.toString().trim();
        if (value.isNotEmpty) denyPatterns.add(value.toLowerCase());
      }
    }

    return LocalNestConfig(
      projects: projects,
      denyPatterns: denyPatterns,
      exposeProjectRoots: json['exposeProjectRoots'] == true,
      maxConcurrentSearches: _intInRange(
        json['maxConcurrentSearches'],
        fallback: 3,
        min: 1,
        max: 16,
      ),
      searchTimeoutMs: _intInRange(
        json['searchTimeoutMs'],
        fallback: 8000,
        min: 500,
        max: 120000,
      ),
      searchCacheTtlSeconds: _intInRange(
        json['searchCacheTtlSeconds'],
        fallback: 20,
        min: 0,
        max: 3600,
      ),
      searchCacheMaxEntries: _intInRange(
        json['searchCacheMaxEntries'],
        fallback: 200,
        min: 1,
        max: 2000,
      ),
      allowBroadRoots: json['allowBroadRoots'] == true,
    );
  }

  static bool _isSafeRoot(String root, {required bool allowBroadRoots}) {
    if (allowBroadRoots) return true;
    final normalized = root.replaceAll('\\', '/').trim();
    if (normalized == '/' || normalized.isEmpty) return false;

    final segments = normalized.split('/').where((s) => s.isNotEmpty).length;
    if (segments < 2) return false;

    final home = Platform.environment['HOME']?.replaceAll('\\', '/').trim();
    if (home != null && home.isNotEmpty && normalized == home) return false;

    return true;
  }

  static int _intInRange(
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

  static List<Pattern> _defaultDenyPatterns() => const <Pattern>[
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
}
