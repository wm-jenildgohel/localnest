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

export class SearchService {
  constructor({ workspace, ignoreDirs, hasRipgrep, rgTimeoutMs, maxFileBytes, vectorIndex }) {
    this.workspace = workspace;
    this.ignoreDirs = ignoreDirs;
    this.hasRipgrep = hasRipgrep;
    this.rgTimeoutMs = rgTimeoutMs;
    this.maxFileBytes = maxFileBytes;
    this.vectorIndex = vectorIndex;
  }

  searchCode({ query, projectPath, allRoots, glob, maxResults, caseSensitive }) {
    const bases = this.workspace.resolveSearchBases(projectPath, allRoots);
    for (const base of bases) {
      const normalized = this.workspace.normalizeTarget(base);
      if (normalized !== base) {
        throw new Error('Resolved base path mismatch');
      }
    }

    const regex = new RegExp(escapeRegex(query), caseSensitive ? '' : 'i');
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
            maxResults: maxResults - matches.length
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
        into: matches
      });

      if (matches.length >= maxResults) {
        return matches.slice(0, maxResults);
      }
    }

    return matches.slice(0, maxResults);
  }

  fastSearchWithRipgrep({ query, base, glob, caseSensitive, maxResults }) {
    const args = [
      '--line-number',
      '--no-heading',
      '--color',
      'never',
      '--no-ignore-messages',
      '--fixed-strings',
      '--max-filesize',
      `${Math.max(1, Math.floor(this.maxFileBytes / 1024))}K`
    ];

    if (!caseSensitive) args.push('-i');
    if (glob && glob !== '*') args.push('--glob', glob);

    for (const ignored of this.ignoreDirs) {
      args.push('--glob', `!**/${ignored}/**`);
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

  searchWithFilesystemWalk({ base, regex, wildcardPattern, maxResults, into }) {
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

          into.push({ file: filePath, line: i + 1, text: lines[i].trim() });
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
    minSemanticScore
  }) {
    const lexical = this.searchCode({
      query,
      projectPath,
      allRoots,
      glob,
      maxResults: Math.max(maxResults * 3, maxResults),
      caseSensitive
    });

    const semantic = this.vectorIndex
      ? this.vectorIndex.semanticSearch({
        query,
        projectPath,
        allRoots,
        maxResults: Math.max(maxResults * 3, maxResults),
        minScore: minSemanticScore
      })
      : [];

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
        semantic_score: 0
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
        semantic_score: 1 / (k + idx + 1)
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
      results: fused
    };
  }
}
