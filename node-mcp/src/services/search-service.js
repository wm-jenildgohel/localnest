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
  constructor({ workspace, ignoreDirs, hasRipgrep, rgTimeoutMs, maxFileBytes }) {
    this.workspace = workspace;
    this.ignoreDirs = ignoreDirs;
    this.hasRipgrep = hasRipgrep;
    this.rgTimeoutMs = rgTimeoutMs;
    this.maxFileBytes = maxFileBytes;
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
}
