import { spawnSync } from 'node:child_process';
import path from 'node:path';

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob) {
  return new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`
  );
}

function validateRegex(pattern) {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

export class SearchService {
  constructor({ workspace, ignoreDirs, hasRipgrep, rgTimeoutMs, maxFileBytes, vectorIndex }) {
    this.workspace = workspace;
    this.ignoreDirs = ignoreDirs;
    this.hasRipgrep = hasRipgrep;
    this.rgTimeoutMs = rgTimeoutMs;
    this.maxFileBytes = maxFileBytes;
    this.vectorIndex = vectorIndex;
    this.autoIndexedScopes = new Set();
    this.defaultAutoIndexMaxFiles = 20000;
  }

  searchCode({ query, projectPath, allRoots, glob, maxResults, caseSensitive, contextLines = 0, useRegex = false }) {
    const bases = this.workspace.resolveSearchBases(projectPath, allRoots);
    for (const base of bases) {
      const normalized = this.workspace.normalizeTarget(base);
      if (normalized !== base) {
        throw new Error('Resolved base path mismatch');
      }
    }

    if (useRegex) {
      const check = validateRegex(query);
      if (!check.valid) {
        throw new Error(`Invalid regex: ${check.reason}`);
      }
    }

    const regex = useRegex
      ? new RegExp(query, caseSensitive ? '' : 'i')
      : new RegExp(escapeRegex(query), caseSensitive ? '' : 'i');
    const wildcardPattern = globToRegExp(glob);

    const matches = [];
    for (const base of bases) {
      if (this.hasRipgrep) {
        try {
          const fastMatches = this.fastSearchWithRipgrep({
            query,
            base,
            glob,
            caseSensitive,
            maxResults: maxResults - matches.length,
            contextLines,
            useRegex
          });
          matches.push(...fastMatches);
          if (matches.length >= maxResults) {
            return matches.slice(0, maxResults);
          }
          continue;
        } catch {
          // Fallback to JS scanner.
        }
      }

      this.searchWithFilesystemWalk({
        base,
        regex,
        wildcardPattern,
        maxResults,
        into: matches,
        contextLines
      });

      if (matches.length >= maxResults) {
        return matches.slice(0, maxResults);
      }
    }

    return matches.slice(0, maxResults);
  }

  fastSearchWithRipgrep({ query, base, glob, caseSensitive, maxResults, contextLines = 0, useRegex = false }) {
    const args = [
      '--line-number',
      '--no-heading',
      '--color',
      'never',
      '--no-ignore-messages',
      '--max-filesize',
      `${Math.max(1, Math.floor(this.maxFileBytes / 1024))}K`
    ];

    if (!useRegex) args.push('--fixed-strings');
    if (!caseSensitive) args.push('-i');
    if (glob && glob !== '*') args.push('--glob', glob);

    for (const ignored of this.ignoreDirs) {
      args.push('--glob', `!**/${ignored}/**`);
    }

    const ctxN = Math.max(0, Math.min(10, contextLines || 0));
    if (ctxN > 0) {
      // Use --json for structured context output — avoids separator ambiguity
      args.push('--json', '-C', String(ctxN));
    }

    args.push(query, base);

    const run = spawnSync('rg', args, {
      encoding: 'utf8',
      timeout: this.rgTimeoutMs,
      maxBuffer: 32 * 1024 * 1024
    });

    if (run.error) throw run.error;

    const out = run.stdout || '';
    if (!out.trim()) return [];

    return ctxN > 0
      ? this._parseRipgrepJsonOutput(out, maxResults)
      : this._parseRipgrepPlainOutput(out, maxResults);
  }

  _parseRipgrepPlainOutput(out, maxResults) {
    const matches = [];
    const lines = out.split(/\r?\n/).filter(Boolean);
    for (const row of lines) {
      const first = row.indexOf(':');
      if (first <= 0) continue;
      const second = row.indexOf(':', first + 1);
      if (second <= first) continue;

      const file = row.slice(0, first);
      const lineNumRaw = row.slice(first + 1, second);
      const line = Number.parseInt(lineNumRaw, 10);
      const text = row.slice(second + 1).trim();

      if (!Number.isFinite(line)) continue;
      matches.push({ file, line, text });
      if (matches.length >= maxResults) break;
    }
    return matches;
  }

  _parseRipgrepJsonOutput(out, maxResults) {
    const matches = [];
    // ctxBuffer: file → Array<{line, text}> pending context_before candidates
    const ctxBuffer = new Map();
    const trailingNl = /\n$/;

    for (const raw of out.split(/\r?\n/)) {
      if (!raw) continue;
      let obj;
      try { obj = JSON.parse(raw); } catch { continue; }

      if (obj.type === 'match') {
        const file = obj.data.path?.text || '';
        const line = obj.data.line_number;
        const text = (obj.data.lines?.text || '').replace(trailingNl, '').trim();

        // Drain buffered context lines that precede this match line
        const buf = ctxBuffer.get(file) || [];
        const before = buf.filter((c) => c.line < line).map((c) => c.text);
        // Keep anything after this line (could be before a later match in same file)
        ctxBuffer.set(file, buf.filter((c) => c.line > line));

        matches.push({ file, line, text, context_before: before, context_after: [] });
        if (matches.length >= maxResults) break;

      } else if (obj.type === 'context') {
        const file = obj.data.path?.text || '';
        const ctxLine = obj.data.line_number;
        const ctxText = (obj.data.lines?.text || '').replace(trailingNl, '');

        // Attach to the most recent match for this file if it's after it
        const lastMatch = [...matches].reverse().find((m) => m.file === file);
        if (lastMatch && ctxLine > lastMatch.line) {
          lastMatch.context_after.push(ctxText);
        } else {
          if (!ctxBuffer.has(file)) ctxBuffer.set(file, []);
          ctxBuffer.get(file).push({ line: ctxLine, text: ctxText });
        }
      }
    }

    return matches;
  }

  searchWithFilesystemWalk({ base, regex, wildcardPattern, maxResults, into, contextLines = 0 }) {
    for (const { files } of this.workspace.walkDirectories(base)) {
      for (const filePath of files) {
        if (!this.workspace.isLikelyTextFile(filePath)) continue;

        const rel = path.relative(base, filePath).split(path.sep).join('/');
        if (!wildcardPattern.test(rel)) continue;

        let text;
        try {
          text = this.workspace.safeReadText(filePath);
        } catch {
          continue;
        }

        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
          if (!regex.test(lines[i])) continue;

          const result = { file: filePath, line: i + 1, text: lines[i].trim() };
          if (contextLines > 0) {
            result.context_before = lines.slice(Math.max(0, i - contextLines), i);
            result.context_after = lines.slice(i + 1, i + 1 + contextLines);
          }
          into.push(result);
          if (into.length >= maxResults) return;
        }
      }
    }
  }

  searchFiles({ query, projectPath, allRoots, maxResults, caseSensitive }) {
    const bases = this.workspace.resolveSearchBases(projectPath, allRoots);
    const regex = new RegExp(escapeRegex(query), caseSensitive ? '' : 'i');
    const results = [];

    for (const base of bases) {
      if (this.hasRipgrep) {
        try {
          const args = ['--files', '--no-ignore-messages'];
          for (const ignored of this.ignoreDirs) {
            args.push('--glob', `!**/${ignored}/**`);
          }
          args.push(base);

          const run = spawnSync('rg', args, {
            encoding: 'utf8',
            timeout: this.rgTimeoutMs,
            maxBuffer: 32 * 1024 * 1024
          });

          if (!run.error && run.stdout) {
            for (const filePath of run.stdout.split(/\r?\n/).filter(Boolean)) {
              if (!regex.test(filePath)) continue;
              const rel = path.relative(base, filePath).split(path.sep).join('/');
              results.push({ file: filePath, relative_path: rel, name: path.basename(filePath) });
              if (results.length >= maxResults) return results;
            }
            continue;
          }
        } catch {
          // fall through to walk
        }
      }

      for (const { files } of this.workspace.walkDirectories(base)) {
        for (const filePath of files) {
          if (!regex.test(filePath)) continue;
          const rel = path.relative(base, filePath).split(path.sep).join('/');
          results.push({ file: filePath, relative_path: rel, name: path.basename(filePath) });
          if (results.length >= maxResults) return results;
        }
      }
    }

    return results;
  }

  searchHybrid({
    query,
    projectPath,
    allRoots,
    glob,
    maxResults,
    caseSensitive,
    minSemanticScore,
    autoIndex = true
  }) {
    const lexical = this.searchCode({
      query,
      projectPath,
      allRoots,
      glob,
      maxResults: maxResults * 3,
      caseSensitive
    });

    let semantic = this.vectorIndex
      ? this.vectorIndex.semanticSearch({
        query,
        projectPath,
        allRoots,
        maxResults: maxResults * 3,
        minScore: minSemanticScore
      })
      : [];
    let autoIndexMeta = null;

    if (this.vectorIndex && autoIndex !== false && semantic.length === 0) {
      const scopeKey = this.buildScopeKey(projectPath, allRoots);
      if (!this.autoIndexedScopes.has(scopeKey)) {
        this.autoIndexedScopes.add(scopeKey);
        try {
          const indexResult = this.vectorIndex.indexProject({
            projectPath,
            allRoots,
            force: false,
            maxFiles: this.defaultAutoIndexMaxFiles
          });
          semantic = this.vectorIndex.semanticSearch({
            query,
            projectPath,
            allRoots,
            maxResults: maxResults * 3,
            minScore: minSemanticScore
          });
          autoIndexMeta = {
            attempted: true,
            scope: scopeKey,
            success: true,
            indexed_files: indexResult?.indexed_files ?? null,
            failed_files: Array.isArray(indexResult?.failed_files) ? indexResult.failed_files.length : null
          };
        } catch (error) {
          autoIndexMeta = {
            attempted: true,
            scope: scopeKey,
            success: false,
            error: String(error?.message || error)
          };
        }
      } else {
        autoIndexMeta = {
          attempted: false,
          scope: scopeKey,
          skipped_reason: 'already_attempted_for_scope'
        };
      }
    }

    const k = 60;
    const scored = new Map();
    const lexicalLineKey = new Map();

    lexical.forEach((item, idx) => {
      const key = `${item.file}:${item.line}:${item.line}`;
      scored.set(key, {
        type: 'lexical',
        file: item.file,
        line: item.line,
        start_line: item.line,
        end_line: item.line,
        text: item.text,
        lexical_rank: idx + 1,
        lexical_score: 1 / (k + idx + 1),
        semantic_rank: null,
        semantic_score: 0,
        semantic_score_raw: null
      });
      lexicalLineKey.set(`${item.file}:${item.line}`, key);
    });

    semantic.forEach((item, idx) => {
      let mergedKey = null;
      for (let line = item.start_line; line <= item.end_line; line += 1) {
        const byLine = lexicalLineKey.get(`${item.file}:${line}`);
        if (byLine) {
          mergedKey = byLine;
          break;
        }
      }
      const key = mergedKey || `${item.file}:${item.start_line}:${item.end_line}`;
      const existing = scored.get(key);
      if (existing) {
        existing.type = 'hybrid';
        existing.start_line = Math.min(existing.start_line || item.start_line, item.start_line);
        existing.end_line = Math.max(existing.end_line || item.end_line, item.end_line);
        if (!existing.snippet) existing.snippet = item.snippet;
        existing.semantic_rank = idx + 1;
        existing.semantic_score = 1 / (k + idx + 1);
        existing.semantic_score_raw = item.semantic_score; // P0-3: preserve actual cosine score
        return;
      }

      scored.set(key, {
        type: 'semantic',
        file: item.file,
        start_line: item.start_line,
        end_line: item.end_line,
        snippet: item.snippet,
        lexical_rank: null,
        lexical_score: 0,
        semantic_rank: idx + 1,
        semantic_score: 1 / (k + idx + 1),
        semantic_score_raw: item.semantic_score // P0-3
      });
    });

    const fused = Array.from(scored.values())
      .map((item) => ({
        ...item,
        rrf_score: item.lexical_score + item.semantic_score
      }))
      .sort((a, b) => b.rrf_score - a.rrf_score)
      .slice(0, maxResults);

    return {
      query,
      lexical_hits: lexical.length,
      semantic_hits: semantic.length,
      auto_index: autoIndexMeta,
      results: fused
    };
  }

  buildScopeKey(projectPath, allRoots) {
    const bases = this.workspace.resolveSearchBases(projectPath, allRoots);
    const normalized = bases.map((base) => this.workspace.normalizeTarget(base)).sort();
    return normalized.join('||');
  }
}
