import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;

import 'models.dart';

class LocalNestTools {
  LocalNestTools(this._config);

  final LocalNestConfig _config;

  static const _maxSearchResultsHard = 200;
  static const _maxSnippetLinesHard = 800;
  static const _maxTreeEntriesHard = 3000;
  static const _maxQueryLength = 256;
  static const _maxPreviewLength = 300;
  static const _maxFileSizeBytes = 1024 * 1024;
  static const _maxFallbackFilesScanned = 5000;
  static const _maxSnippetLineLength = 2000;

  final LinkedHashMap<String, _SearchCacheEntry> _searchCache =
      LinkedHashMap<String, _SearchCacheEntry>();

  bool? _rgAvailable;
  bool? _gitAvailable;

  Map<String, dynamic> listToolsSchema() {
    return {
      'tools': [
        {
          'name': 'smart_context',
          'description':
              'Primary one-call tool for AI agents. Finds relevant matches and returns nearby code snippets in a single response.',
          'inputSchema': {
            'type': 'object',
            'properties': {
              'query': {'type': 'string'},
              'q': {'type': 'string'},
              'pattern': {'type': 'string'},
              'text': {'type': 'string'},
              'project': {'type': 'string'},
              'projectName': {'type': 'string'},
              'allProjects': {'type': 'boolean'},
              'maxResults': {
                'type': 'integer',
                'minimum': 1,
                'maximum': 50,
              },
              'maxSnippets': {
                'type': 'integer',
                'minimum': 1,
                'maximum': 20,
              },
              'contextLines': {'type': 'integer', 'minimum': 0, 'maximum': 80},
              'caseSensitive': {'type': 'boolean'},
            },
            'anyOf': [
              {
                'required': ['query'],
              },
              {
                'required': ['q'],
              },
              {
                'required': ['pattern'],
              },
              {
                'required': ['text'],
              },
            ],
            'additionalProperties': true,
          },
        },
        {
          'name': 'list_projects',
          'description':
              'First call in a session. Lists configured project aliases. Use aliases from this output in other tools.',
          'inputSchema': {
            'type': 'object',
            'properties': {},
            'additionalProperties': true,
          },
        },
        {
          'name': 'search_code',
          'description':
              'Find text in code. Typical flow: list_projects -> search_code -> get_file_snippet. Accepts query aliases (query/q/pattern/text) and project aliases (project/projectName).',
          'inputSchema': {
            'type': 'object',
            'properties': {
              'query': {'type': 'string'},
              'q': {'type': 'string'},
              'pattern': {'type': 'string'},
              'text': {'type': 'string'},
              'project': {'type': 'string'},
              'projectName': {'type': 'string'},
              'maxResults': {
                'type': 'integer',
                'minimum': 1,
                'maximum': _maxSearchResultsHard,
              },
              'caseSensitive': {'type': 'boolean'},
            },
            'anyOf': [
              {
                'required': ['query'],
              },
              {
                'required': ['q'],
              },
              {
                'required': ['pattern'],
              },
              {
                'required': ['text'],
              },
            ],
            'additionalProperties': true,
          },
        },
        {
          'name': 'get_file_snippet',
          'description':
              'Read file lines by project/path. If only one project is configured, project can be omitted. Accepts aliases: project/projectName, path/file/filePath, aroundLine/line, startLine/start, endLine/end.',
          'inputSchema': {
            'type': 'object',
            'properties': {
              'project': {'type': 'string'},
              'projectName': {'type': 'string'},
              'path': {'type': 'string'},
              'file': {'type': 'string'},
              'filePath': {'type': 'string'},
              'startLine': {'type': 'integer', 'minimum': 1},
              'start': {'type': 'integer', 'minimum': 1},
              'endLine': {'type': 'integer', 'minimum': 1},
              'end': {'type': 'integer', 'minimum': 1},
              'aroundLine': {'type': 'integer', 'minimum': 1},
              'line': {'type': 'integer', 'minimum': 1},
              'contextLines': {'type': 'integer', 'minimum': 0, 'maximum': 200},
            },
            'anyOf': [
              {
                'required': ['path'],
              },
              {
                'required': ['file'],
              },
              {
                'required': ['filePath'],
              },
            ],
            'additionalProperties': true,
          },
        },
        {
          'name': 'get_repo_structure',
          'description':
              'List files/directories under a project root with bounds. If one project exists, project can be omitted.',
          'inputSchema': {
            'type': 'object',
            'properties': {
              'project': {'type': 'string'},
              'projectName': {'type': 'string'},
              'maxDepth': {'type': 'integer', 'minimum': 1, 'maximum': 10},
              'maxEntries': {
                'type': 'integer',
                'minimum': 1,
                'maximum': _maxTreeEntriesHard,
              },
            },
            'required': [],
            'additionalProperties': true,
          },
        },
      ],
    };
  }

  Future<Map<String, dynamic>> callTool(
    String name,
    Map<String, dynamic> args,
  ) async {
    switch (name) {
      case 'smart_context':
        return _smartContext(args);
      case 'list_projects':
        return _ok({
          'projects': _config.projects
              .map(
                (p) =>
                    _config.exposeProjectRoots ? p.toJson() : {'name': p.name},
              )
              .toList(),
          'count': _config.projects.length,
          'exposeProjectRoots': _config.exposeProjectRoots,
        });
      case 'search_code':
        return _searchCode(args);
      case 'get_file_snippet':
        return _getFileSnippet(args);
      case 'get_repo_structure':
        return _getRepoStructure(args);
      default:
        return _error('Unknown tool: $name');
    }
  }

  Future<Map<String, dynamic>> _smartContext(Map<String, dynamic> args) async {
    final query = _firstNonEmptyString(args, const [
      'query',
      'q',
      'pattern',
      'text',
    ]);
    if (query.isEmpty) return _error('query is required');

    final requestedProject = _firstNonEmptyString(args, const [
      'project',
      'projectName',
    ]);
    final allProjects = args['allProjects'] == true;
    String projectForSearch = requestedProject;
    var autoScoped = false;
    if (!allProjects &&
        projectForSearch.isEmpty &&
        _config.projects.length > 1) {
      projectForSearch = _config.projects.first.name;
      autoScoped = true;
    }

    final searchResult = await _searchCode({
      'query': query,
      'project': projectForSearch,
      'maxResults': _clampInt(
        args['maxResults'],
        defaultValue: 8,
        min: 1,
        max: 50,
      ),
      'caseSensitive': args['caseSensitive'] == true,
    });
    if (searchResult['isError'] == true) return searchResult;

    final searchData = searchResult['structuredContent'] as Map<String, dynamic>;
    final matches = (searchData['matches'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
    final maxSnippets = _clampInt(
      args['maxSnippets'],
      defaultValue: 4,
      min: 1,
      max: 20,
    );
    final contextLines = _clampInt(
      args['contextLines'],
      defaultValue: 20,
      min: 0,
      max: 80,
    );

    final snippets = <Map<String, dynamic>>[];
    final seen = <String>{};

    for (final match in matches) {
      if (snippets.length >= maxSnippets) break;
      final project = (match['project'] ?? '').toString();
      final path = (match['path'] ?? '').toString();
      final line = _nullableInt(match['line']) ?? 1;
      if (project.isEmpty || path.isEmpty) continue;

      final dedupeKey = '$project::$path::$line';
      if (!seen.add(dedupeKey)) continue;

      final snippetResult = await _getFileSnippet({
        'project': project,
        'path': path,
        'aroundLine': line,
        'contextLines': contextLines,
      });
      if (snippetResult['isError'] == true) continue;

      final snippetData =
          snippetResult['structuredContent'] as Map<String, dynamic>;
      snippets.add({
        'project': snippetData['project'],
        'path': snippetData['path'],
        'line': line,
        'startLine': snippetData['startLine'],
        'endLine': snippetData['endLine'],
        'snippet': snippetData['snippet'],
      });
    }

    final projects = _config.projects.map((p) => p.name).toList();
    final projectFilter = requestedProject;

    return _ok({
      'query': query,
      'projectFilter': projectFilter,
      'effectiveProject': projectForSearch,
      'allProjects': allProjects,
      'autoScoped': autoScoped,
      'projects': projects,
      'matchCount': matches.length,
      'matches': matches,
      'snippetCount': snippets.length,
      'snippets': snippets,
      'meta': searchData['meta'],
      'nextAction':
          autoScoped
              ? 'Set project explicitly or pass allProjects=true to search across all projects.'
              : snippets.isEmpty
              ? 'Try broader query text or increase maxResults.'
              : 'Use get_file_snippet for deeper ranges on selected files.',
    });
  }

  Future<Map<String, dynamic>> _searchCode(Map<String, dynamic> args) async {
    final query = _firstNonEmptyString(args, const [
      'query',
      'q',
      'pattern',
      'text',
    ]);
    if (query.isEmpty) return _error('query is required');
    if (query.length > _maxQueryLength) {
      return _error('query too long (max $_maxQueryLength chars)');
    }

    final projectFilter = _firstNonEmptyString(args, const [
      'project',
      'projectName',
    ]);
    final maxResults = _clampInt(
      args['maxResults'],
      defaultValue: 20,
      min: 1,
      max: _maxSearchResultsHard,
    );
    final caseSensitive = args['caseSensitive'] == true;

    final projects = _selectedProjects(projectFilter);
    if (projects.isEmpty) {
      return _error('No matching project for filter: $projectFilter');
    }

    final cacheKey = _cacheKey(
      query: query,
      projectFilter: projectFilter,
      maxResults: maxResults,
      caseSensitive: caseSensitive,
    );
    final cached = _getCached(cacheKey);
    if (cached != null) {
      return _ok({
        'query': query,
        'count': cached.length,
        'matches': cached,
        'meta': {'cacheHit': true, 'backend': 'cache', 'partial': false},
      });
    }

    final deadline = DateTime.now().add(
      Duration(milliseconds: _config.searchTimeoutMs),
    );
    final aggregate = await _searchAcrossProjects(
      projects: projects,
      query: query,
      caseSensitive: caseSensitive,
      maxResults: maxResults,
      deadline: deadline,
    );

    final matches = <Map<String, dynamic>>[];
    final backends = <String>{};

    for (final chunk in aggregate.chunks) {
      backends.add(chunk.backend);
      for (final item in chunk.matches) {
        matches.add(item);
        if (matches.length >= maxResults) break;
      }
      if (matches.length >= maxResults) break;
    }

    _putCached(cacheKey, matches);

    return _ok({
      'query': query,
      'count': matches.length,
      'matches': matches,
      'meta': {
        'cacheHit': false,
        'backends': backends.toList()..sort(),
        'partial': aggregate.partial,
      },
    });
  }

  Future<_SearchAggregate> _searchAcrossProjects({
    required List<ProjectConfig> projects,
    required String query,
    required bool caseSensitive,
    required int maxResults,
    required DateTime deadline,
  }) async {
    final concurrency = _config.maxConcurrentSearches.clamp(1, 16);
    final output = List<_ProjectSearchChunk?>.filled(projects.length, null);

    var nextIndex = 0;
    var collected = 0;
    var partial = false;

    Future<void> worker() async {
      while (true) {
        if (DateTime.now().isAfter(deadline)) {
          partial = true;
          return;
        }
        if (collected >= maxResults) return;
        if (nextIndex >= projects.length) return;

        final i = nextIndex;
        nextIndex += 1;

        final chunk = await _searchSingleProject(
          projects[i],
          query: query,
          caseSensitive: caseSensitive,
          maxResults: maxResults,
          deadline: deadline,
        );

        output[i] = chunk;
        collected += chunk.matches.length;
        if (chunk.timedOut) partial = true;
      }
    }

    final workers = <Future<void>>[];
    for (var i = 0; i < concurrency; i++) {
      workers.add(worker());
    }
    await Future.wait(workers);

    return _SearchAggregate(
      chunks: output.whereType<_ProjectSearchChunk>().toList(),
      partial: partial || DateTime.now().isAfter(deadline),
    );
  }

  Future<_ProjectSearchChunk> _searchSingleProject(
    ProjectConfig project, {
    required String query,
    required bool caseSensitive,
    required int maxResults,
    required DateTime deadline,
  }) async {
    if (DateTime.now().isAfter(deadline)) {
      return const _ProjectSearchChunk(
        matches: [],
        backend: 'deadline_exceeded',
        timedOut: true,
      );
    }

    if (await _hasRg()) {
      final rgResult = await _searchWithRipgrep(
        project,
        query: query,
        caseSensitive: caseSensitive,
        maxResults: maxResults,
        deadline: deadline,
      );
      if (rgResult.backend == 'ripgrep') {
        return rgResult;
      }
    }

    if (await _hasGit()) {
      final gitDir = Directory(p.join(project.root, '.git'));
      if (await gitDir.exists()) {
        final gitResult = await _searchWithGitGrep(
          project,
          query: query,
          caseSensitive: caseSensitive,
          maxResults: maxResults,
          deadline: deadline,
        );
        if (gitResult.backend == 'gitgrep') {
          return gitResult;
        }
      }
    }

    return _searchWithDartWalk(
      project,
      query: query,
      caseSensitive: caseSensitive,
      maxResults: maxResults,
      deadline: deadline,
    );
  }

  Future<_ProjectSearchChunk> _searchWithRipgrep(
    ProjectConfig project, {
    required String query,
    required bool caseSensitive,
    required int maxResults,
    required DateTime deadline,
  }) async {
    final remainingMs = _remainingMs(deadline);
    if (remainingMs <= 0) {
      return const _ProjectSearchChunk(
        matches: [],
        backend: 'ripgrep_timeout',
        timedOut: true,
      );
    }

    final rgArgs = <String>[
      '--json',
      '--fixed-strings',
      '--line-number',
      '--max-count',
      '$maxResults',
      '--max-filesize',
      '1M',
    ];
    if (!caseSensitive) rgArgs.add('--ignore-case');
    rgArgs.addAll([
      '--glob',
      '!**/.git/**',
      '--glob',
      '!**/node_modules/**',
      '--glob',
      '!**/build/**',
      query,
      project.root,
    ]);

    ProcessResult result;
    try {
      result = await Process.run('rg', rgArgs).timeout(
        Duration(milliseconds: remainingMs),
        onTimeout: () => ProcessResult(0, -1, '', 'timeout'),
      );
    } on ProcessException {
      _rgAvailable = false;
      return const _ProjectSearchChunk(matches: [], backend: 'rg_missing');
    }
    if (result.exitCode == -1) {
      return const _ProjectSearchChunk(
        matches: [],
        backend: 'ripgrep_timeout',
        timedOut: true,
      );
    }

    final lines = const LineSplitter().convert(
      (result.stdout ?? '').toString(),
    );
    final matches = <Map<String, dynamic>>[];

    for (final line in lines) {
      if (line.trim().isEmpty) continue;
      Map<String, dynamic> event;
      try {
        event = jsonDecode(line) as Map<String, dynamic>;
      } catch (_) {
        continue;
      }
      if (event['type'] != 'match') continue;

      final data = event['data'];
      if (data is! Map<String, dynamic>) continue;

      final pathText = ((data['path'] as Map?)?['text'] ?? '').toString();
      final relativePath = _safeRelative(project.root, pathText);
      if (relativePath == null || _isDenied(relativePath)) continue;

      final lineNumber = (data['line_number'] is int)
          ? data['line_number'] as int
          : int.tryParse('${data['line_number']}') ?? 0;
      final preview = ((data['lines'] as Map?)?['text'] ?? '')
          .toString()
          .trimRight();

      matches.add({
        'project': project.name,
        'path': relativePath,
        'line': lineNumber,
        'preview': _truncatePreview(preview),
      });
      if (matches.length >= maxResults) break;
    }

    return _ProjectSearchChunk(matches: matches, backend: 'ripgrep');
  }

  Future<_ProjectSearchChunk> _searchWithGitGrep(
    ProjectConfig project, {
    required String query,
    required bool caseSensitive,
    required int maxResults,
    required DateTime deadline,
  }) async {
    final remainingMs = _remainingMs(deadline);
    if (remainingMs <= 0) {
      return const _ProjectSearchChunk(
        matches: [],
        backend: 'gitgrep_timeout',
        timedOut: true,
      );
    }

    final args = <String>[
      '-C',
      project.root,
      'grep',
      '-n',
      '--no-color',
      '-I',
      '--fixed-strings',
    ];
    if (!caseSensitive) args.add('-i');
    args.addAll(['-m', '$maxResults', query, '--', '.']);

    ProcessResult result;
    try {
      result = await Process.run('git', args).timeout(
        Duration(milliseconds: remainingMs),
        onTimeout: () => ProcessResult(0, -1, '', 'timeout'),
      );
    } on ProcessException {
      _gitAvailable = false;
      return const _ProjectSearchChunk(matches: [], backend: 'git_missing');
    }
    if (result.exitCode == -1) {
      return const _ProjectSearchChunk(
        matches: [],
        backend: 'gitgrep_timeout',
        timedOut: true,
      );
    }

    final out = (result.stdout ?? '').toString();
    if (result.exitCode > 1) {
      return const _ProjectSearchChunk(matches: [], backend: 'gitgrep_error');
    }

    final lines = const LineSplitter().convert(out);
    final matches = <Map<String, dynamic>>[];

    for (final row in lines) {
      final first = row.indexOf(':');
      if (first <= 0) continue;
      final second = row.indexOf(':', first + 1);
      if (second <= first) continue;

      final rel = row.substring(0, first).trim();
      if (_isDenied(rel)) continue;

      final lineNumber = int.tryParse(row.substring(first + 1, second)) ?? 0;
      final preview = row.substring(second + 1).trimRight();
      matches.add({
        'project': project.name,
        'path': rel.replaceAll('\\', '/'),
        'line': lineNumber,
        'preview': _truncatePreview(preview),
      });
      if (matches.length >= maxResults) break;
    }

    return _ProjectSearchChunk(matches: matches, backend: 'gitgrep');
  }

  Future<_ProjectSearchChunk> _searchWithDartWalk(
    ProjectConfig project, {
    required String query,
    required bool caseSensitive,
    required int maxResults,
    required DateTime deadline,
  }) async {
    final matches = <Map<String, dynamic>>[];
    final needle = caseSensitive ? query : query.toLowerCase();
    var scannedFiles = 0;
    var timedOut = false;

    try {
      await for (final entity in Directory(
        project.root,
      ).list(recursive: true, followLinks: false)) {
        if (matches.length >= maxResults) break;
        if (DateTime.now().isAfter(deadline)) {
          timedOut = true;
          break;
        }
        if (entity is! File) continue;
        scannedFiles += 1;
        if (scannedFiles > _maxFallbackFilesScanned) {
          timedOut = true;
          break;
        }

        final rel = _safeRelative(project.root, entity.path);
        if (rel == null || _isDenied(rel)) continue;

        FileStat stat;
        try {
          stat = await entity.stat();
        } catch (_) {
          continue;
        }
        if (stat.size > _maxFileSizeBytes) continue;

        List<String> lines;
        try {
          lines = await entity.readAsLines();
        } catch (_) {
          continue;
        }

        for (var i = 0; i < lines.length; i++) {
          final candidate = caseSensitive ? lines[i] : lines[i].toLowerCase();
          if (!candidate.contains(needle)) continue;
          matches.add({
            'project': project.name,
            'path': rel,
            'line': i + 1,
            'preview': _truncatePreview(lines[i]),
          });
          if (matches.length >= maxResults) break;
        }
      }
    } catch (_) {
      timedOut = true;
    }

    return _ProjectSearchChunk(
      matches: matches,
      backend: 'dart_scan',
      timedOut: timedOut,
    );
  }

  Future<bool> _hasRg() async {
    _rgAvailable ??= await _hasCommand('rg', const ['--version']);
    return _rgAvailable!;
  }

  Future<bool> _hasGit() async {
    _gitAvailable ??= await _hasCommand('git', const ['--version']);
    return _gitAvailable!;
  }

  Future<bool> _hasCommand(String command, List<String> args) async {
    try {
      final out = await Process.run(command, args);
      return out.exitCode == 0;
    } on ProcessException {
      return false;
    }
  }

  Future<Map<String, dynamic>> _getFileSnippet(
    Map<String, dynamic> args,
  ) async {
    final projectName = _firstNonEmptyString(args, const [
      'project',
      'projectName',
    ]);
    final inputPath = _firstNonEmptyString(args, const [
      'path',
      'file',
      'filePath',
    ]);

    if (inputPath.isEmpty) {
      return _error('path is required');
    }

    final project = _findProjectWithFallback(projectName);
    if (project == null) {
      if (projectName.isNotEmpty) return _error('Unknown project: $projectName');
      return _error(
        'project is required when multiple projects are configured. Call list_projects first.',
      );
    }

    final resolved = _resolveProjectPath(project, inputPath);
    if (resolved == null) return _error('path is outside allowed root');
    if (_isDenied(resolved.relative)) {
      return _error('path denied by security policy');
    }

    final file = File(resolved.absolute);
    if (!await file.exists()) return _error('file not found');
    if (!await _isResolvedFileWithinProject(project, file)) {
      return _error('path resolves outside allowed root');
    }

    List<String> lines;
    try {
      lines = await file.readAsLines();
    } catch (_) {
      return _error('unable to read file as text');
    }

    if (lines.isEmpty) {
      return _ok({
        'project': project.name,
        'path': resolved.relative,
        'startLine': 1,
        'endLine': 1,
        'snippet': '',
      });
    }

    final aroundLine = _firstInt(args, const ['aroundLine', 'line']);
    final contextLines = _clampInt(
      args['contextLines'],
      defaultValue: 20,
      min: 0,
      max: 200,
    );

    int startLine;
    int endLine;

    if (aroundLine != null) {
      startLine = aroundLine - contextLines;
      endLine = aroundLine + contextLines;
    } else {
      startLine = _clampInt(
        _firstInt(args, const ['startLine', 'start']),
        defaultValue: 1,
        min: 1,
        max: lines.length,
      );
      endLine = _clampInt(
        _firstInt(args, const ['endLine', 'end']),
        defaultValue: startLine + 80,
        min: 1,
        max: lines.length,
      );
    }

    if (startLine < 1) startLine = 1;
    if (endLine < startLine) endLine = startLine;

    final windowSize = endLine - startLine + 1;
    if (windowSize > _maxSnippetLinesHard) {
      endLine = startLine + _maxSnippetLinesHard - 1;
    }
    if (endLine > lines.length) endLine = lines.length;

    final buffer = StringBuffer();
    for (var i = startLine; i <= endLine; i++) {
      buffer.writeln('$i: ${_truncateSnippetLine(lines[i - 1])}');
    }

    return _ok({
      'project': project.name,
      'path': resolved.relative,
      'startLine': startLine,
      'endLine': endLine,
      'snippet': buffer.toString().trimRight(),
    });
  }

  Future<Map<String, dynamic>> _getRepoStructure(
    Map<String, dynamic> args,
  ) async {
    final projectName = _firstNonEmptyString(args, const [
      'project',
      'projectName',
    ]);
    final project = _findProjectWithFallback(projectName);
    if (project == null) {
      if (projectName.isNotEmpty) return _error('Unknown project: $projectName');
      return _error(
        'project is required when multiple projects are configured. Call list_projects first.',
      );
    }

    final maxDepth = _clampInt(
      args['maxDepth'],
      defaultValue: 3,
      min: 1,
      max: 10,
    );
    final maxEntries = _clampInt(
      args['maxEntries'],
      defaultValue: 500,
      min: 1,
      max: _maxTreeEntriesHard,
    );

    final rootDir = Directory(project.root);
    final entries = <Map<String, dynamic>>[];

    Future<void> walk(Directory dir, int depth) async {
      if (depth > maxDepth || entries.length >= maxEntries) return;

      try {
        final stream = dir.list(followLinks: false);
        await for (final entity in stream) {
          if (entries.length >= maxEntries) break;

          final rel = _safeRelative(project.root, entity.path);
          if (rel == null || rel == '.') continue;
          if (_isDenied(rel)) continue;

          final isDir = entity is Directory;
          entries.add({
            'path': rel,
            'type': isDir ? 'dir' : 'file',
            'depth': rel.split('/').length,
          });

          if (isDir && depth < maxDepth) {
            await walk(entity, depth + 1);
          }
        }
      } catch (_) {
        // Skip unreadable directories.
      }
    }

    await walk(rootDir, 1);

    return _ok({
      'project': project.name,
      'maxDepth': maxDepth,
      'maxEntries': maxEntries,
      'count': entries.length,
      'entries': entries,
    });
  }

  List<ProjectConfig> _selectedProjects(String filter) {
    if (filter.isEmpty) return _config.projects;
    return _config.projects.where((p) => p.name == filter).toList();
  }

  ProjectConfig? _findProject(String name) {
    for (final project in _config.projects) {
      if (project.name == name) return project;
    }
    return null;
  }

  ProjectConfig? _findProjectWithFallback(String name) {
    final trimmed = name.trim();
    if (trimmed.isNotEmpty) return _findProject(trimmed);
    if (_config.projects.length == 1) return _config.projects.first;
    return null;
  }

  ({String absolute, String relative})? _resolveProjectPath(
    ProjectConfig project,
    String inputPath,
  ) {
    final normalized = p.normalize(inputPath.replaceAll('\\', '/'));
    String full;
    if (p.isAbsolute(normalized)) {
      full = p.absolute(normalized);
    } else {
      if (normalized.startsWith('../') || normalized == '..') return null;
      full = p.absolute(p.normalize(p.join(project.root, normalized)));
    }
    final base = p.absolute(project.root);

    if (!_isWithin(base, full)) return null;
    final relative = _safeRelative(project.root, full);
    if (relative == null) return null;

    return (absolute: full, relative: relative);
  }

  bool _isWithin(String base, String target) {
    final b = p.normalize(base);
    final t = p.normalize(target);
    return t == b || t.startsWith('$b${Platform.pathSeparator}');
  }

  Future<bool> _isResolvedFileWithinProject(
    ProjectConfig project,
    File file,
  ) async {
    String resolvedRoot;
    try {
      resolvedRoot = await Directory(project.root).resolveSymbolicLinks();
    } catch (_) {
      resolvedRoot = p.absolute(project.root);
    }

    String resolvedFile;
    try {
      resolvedFile = await file.resolveSymbolicLinks();
    } catch (_) {
      resolvedFile = p.absolute(file.path);
    }

    return _isWithin(resolvedRoot, resolvedFile);
  }

  String? _safeRelative(String root, String maybeAbsolute) {
    final absRoot = p.absolute(root);
    final absPath = p.absolute(maybeAbsolute);
    if (!_isWithin(absRoot, absPath)) return null;

    final relative = p.relative(absPath, from: absRoot).replaceAll('\\', '/');
    return relative;
  }

  bool _isDenied(String relativePath) {
    final lower = relativePath.toLowerCase();
    for (final pattern in _config.denyPatterns) {
      if (pattern is String && lower.contains(pattern)) return true;
    }
    return false;
  }

  int _clampInt(
    dynamic value, {
    required int defaultValue,
    required int min,
    required int max,
  }) {
    final parsed = _nullableInt(value) ?? defaultValue;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  }

  int? _nullableInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    return int.tryParse(value.toString());
  }

  String _firstNonEmptyString(Map<String, dynamic> args, List<String> keys) {
    for (final key in keys) {
      final value = (args[key] ?? '').toString().trim();
      if (value.isNotEmpty) return value;
    }
    return '';
  }

  int? _firstInt(Map<String, dynamic> args, List<String> keys) {
    for (final key in keys) {
      final value = _nullableInt(args[key]);
      if (value != null) return value;
    }
    return null;
  }

  String _cacheKey({
    required String query,
    required String projectFilter,
    required int maxResults,
    required bool caseSensitive,
  }) {
    return '${query.toLowerCase()}|$projectFilter|$maxResults|$caseSensitive';
  }

  List<Map<String, dynamic>>? _getCached(String key) {
    if (_config.searchCacheTtlSeconds <= 0) return null;
    final now = DateTime.now();
    final cached = _searchCache.remove(key);
    if (cached == null) return null;
    if (cached.expiresAt.isBefore(now)) return null;
    _searchCache[key] = cached;
    return cached.matches;
  }

  void _putCached(String key, List<Map<String, dynamic>> matches) {
    if (_config.searchCacheTtlSeconds <= 0) return;
    final ttl = Duration(seconds: _config.searchCacheTtlSeconds);
    _searchCache.remove(key);
    _searchCache[key] = _SearchCacheEntry(
      matches: List<Map<String, dynamic>>.from(matches),
      expiresAt: DateTime.now().add(ttl),
    );
    while (_searchCache.length > _config.searchCacheMaxEntries) {
      _searchCache.remove(_searchCache.keys.first);
    }
  }

  String _truncatePreview(String text) {
    return text.length > _maxPreviewLength
        ? text.substring(0, _maxPreviewLength)
        : text;
  }

  String _truncateSnippetLine(String text) {
    return text.length > _maxSnippetLineLength
        ? text.substring(0, _maxSnippetLineLength)
        : text;
  }

  int _remainingMs(DateTime deadline) {
    final ms = deadline.difference(DateTime.now()).inMilliseconds;
    return ms < 0 ? 0 : ms;
  }

  Map<String, dynamic> _ok(Map<String, dynamic> data) => {
    'isError': false,
    'structuredContent': data,
    'content': [
      {
        'type': 'text',
        'text': const JsonEncoder.withIndent('  ').convert(data),
      },
    ],
  };

  Map<String, dynamic> _error(String message) => {
    'isError': true,
    'structuredContent': {'error': message},
    'content': [
      {'type': 'text', 'text': message},
    ],
  };
}

class _SearchCacheEntry {
  const _SearchCacheEntry({required this.matches, required this.expiresAt});

  final List<Map<String, dynamic>> matches;
  final DateTime expiresAt;
}

class _ProjectSearchChunk {
  const _ProjectSearchChunk({
    required this.matches,
    required this.backend,
    this.timedOut = false,
  });

  final List<Map<String, dynamic>> matches;
  final String backend;
  final bool timedOut;
}

class _SearchAggregate {
  const _SearchAggregate({required this.chunks, required this.partial});

  final List<_ProjectSearchChunk> chunks;
  final bool partial;
}
