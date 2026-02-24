import fs from 'node:fs';
import path from 'node:path';
import { expandHome } from '../config.js';

export class WorkspaceService {
  constructor({
    roots,
    ignoreDirs,
    textExtensions,
    projectMarkerFiles,
    projectHintDirs,
    extraProjectMarkers,
    maxFileBytes,
    autoProjectSplit,
    maxAutoProjects,
    forceSplitChildren
  }) {
    this.roots = roots;
    this.ignoreDirs = ignoreDirs;
    this.textExtensions = textExtensions;
    this.projectMarkerFiles = projectMarkerFiles;
    this.projectHintDirs = projectHintDirs;
    this.extraProjectMarkers = extraProjectMarkers;
    this.maxFileBytes = maxFileBytes;
    this.autoProjectSplit = autoProjectSplit;
    this.maxAutoProjects = maxAutoProjects;
    this.forceSplitChildren = forceSplitChildren;
  }

  listRoots() {
    return this.roots;
  }

  normalizeTarget(inputPath) {
    const maybeExpanded = expandHome(inputPath);
    const resolved = path.isAbsolute(maybeExpanded)
      ? path.resolve(maybeExpanded)
      : path.resolve(this.roots[0].path, maybeExpanded);

    if (!this.isUnderRoots(resolved)) {
      throw new Error('Path is outside configured roots');
    }

    return resolved;
  }

  resolveSearchBases(projectPath, allRoots) {
    if (projectPath) {
      return [this.normalizeTarget(projectPath)];
    }

    const rawBases = allRoots ? this.roots.map((r) => r.path) : [this.roots[0].path];
    if (!this.autoProjectSplit) return rawBases;

    const expanded = [];
    for (const base of rawBases) {
      expanded.push(...this.splitRootIntoProjects(base));
    }
    return expanded;
  }

  listProjects(rootPath, maxEntries) {
    const root = rootPath ? this.normalizeTarget(rootPath) : this.roots[0].path;
    const st = fs.statSync(root);
    if (!st.isDirectory()) {
      throw new Error('root_path is not a directory');
    }

    const entries = fs.readdirSync(root, { withFileTypes: true });
    const result = [];

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (result.length >= maxEntries) break;
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const projectPath = path.join(root, entry.name);
      result.push({
        name: entry.name,
        path: projectPath,
        markers: this.detectProjectMarkers(projectPath).join(',')
      });
    }

    return result;
  }

  projectTree(projectPath, maxDepth, maxEntries) {
    const root = this.normalizeTarget(projectPath);
    const st = fs.statSync(root);
    if (!st.isDirectory()) {
      throw new Error('project_path is not a directory');
    }

    const rootParts = root.split(path.sep).length;
    const lines = [];

    for (const { current, files } of this.walkDirectories(root)) {
      const depth = current.split(path.sep).length - rootParts;
      if (depth > maxDepth) continue;

      const indent = '  '.repeat(depth);
      if (depth > 0) {
        lines.push(`${indent}${path.basename(current)}/`);
      }

      for (const filePath of files.sort((a, b) => a.localeCompare(b))) {
        lines.push(`${indent}  ${path.basename(filePath)}`);
        if (lines.length >= maxEntries) {
          return lines.slice(0, maxEntries);
        }
      }

      if (lines.length >= maxEntries) {
        return lines.slice(0, maxEntries);
      }
    }

    return lines;
  }

  summarizeProject(projectPath, maxFiles) {
    const root = this.normalizeTarget(projectPath);
    const st = fs.statSync(root);
    if (!st.isDirectory()) {
      throw new Error('project_path is not a directory');
    }

    const counts = new Map();
    let totalFiles = 0;
    let totalDirs = 0;

    for (const { dirs, files } of this.walkDirectories(root)) {
      totalDirs += dirs.length;

      for (const filePath of files) {
        if (path.basename(filePath).startsWith('.')) continue;
        totalFiles += 1;

        const ext = path.extname(filePath).toLowerCase() || '<none>';
        counts.set(ext, (counts.get(ext) || 0) + 1);

        if (totalFiles >= maxFiles) break;
      }

      if (totalFiles >= maxFiles) break;
    }

    const topExtensions = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([ext, count]) => ({ ext, count }));

    return {
      path: root,
      directories: totalDirs,
      files_counted: totalFiles,
      top_extensions: topExtensions,
      truncated: totalFiles >= maxFiles
    };
  }

  readFileChunk(requestedPath, startLine, endLine, maxSpan) {
    let from = startLine;
    let to = endLine;

    if (to < from) to = from;
    if (to - from + 1 > maxSpan) {
      to = from + maxSpan - 1;
    }

    const target = this.normalizeTarget(requestedPath);
    const st = fs.statSync(target);
    if (!st.isFile()) {
      throw new Error('path is not a file');
    }

    const content = this.safeReadText(target);
    const lines = content.split(/\r?\n/);
    const selected = lines.slice(from - 1, to);
    const numbered = selected.map((line, idx) => `${from + idx}: ${line}`).join('\n');

    return {
      path: target,
      start_line: from,
      end_line: Math.min(to, lines.length),
      total_lines: lines.length,
      content: numbered
    };
  }

  *walkDirectories(base) {
    const stack = [base];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      let entries;
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }

      const dirs = [];
      const files = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (!this.ignoreDirs.has(entry.name)) dirs.push(full);
        } else if (entry.isFile()) {
          files.push(full);
        }
      }

      yield { current, dirs, files };

      for (const dir of dirs.sort().reverse()) {
        stack.push(dir);
      }
    }
  }

  isLikelyTextFile(filePath) {
    return this.textExtensions.has(path.extname(filePath).toLowerCase());
  }

  safeReadText(filePath) {
    const st = fs.statSync(filePath);
    if (st.size > this.maxFileBytes) {
      throw new Error(`File too large (${st.size} bytes). Limit: ${this.maxFileBytes} bytes`);
    }
    return fs.readFileSync(filePath, 'utf8');
  }

  isUnderRoots(targetPath) {
    const resolved = path.resolve(targetPath);
    return this.roots.some((root) => {
      const rel = path.relative(root.path, resolved);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    });
  }

  splitRootIntoProjects(rootPath) {
    let entries;
    try {
      entries = fs.readdirSync(rootPath, { withFileTypes: true });
    } catch {
      return [rootPath];
    }

    const candidateChildren = [];
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (this.ignoreDirs.has(entry.name)) continue;

      const full = path.join(rootPath, entry.name);
      candidateChildren.push(full);
      if (!this.looksLikeProjectDir(full)) continue;
      projects.push(full);
      if (projects.length >= this.maxAutoProjects) break;
    }

    if (projects.length === 0 && this.forceSplitChildren) {
      return candidateChildren.slice(0, this.maxAutoProjects);
    }

    return projects.length > 0 ? projects : [rootPath];
  }

  looksLikeProjectDir(dirPath) {
    if (fs.existsSync(path.join(dirPath, '.git'))) return true;

    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (this.projectMarkerFiles.has(entry.name)) return true;
      if (this.extraProjectMarkers.has(entry.name)) return true;
      if (entry.name.endsWith('.sln') || entry.name.endsWith('.csproj') || entry.name.endsWith('.xcodeproj')) {
        return true;
      }
    }

    let hintDirCount = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (this.projectHintDirs.has(entry.name)) {
        hintDirCount += 1;
        if (hintDirCount >= 2) return true;
      }
    }

    return false;
  }

  detectProjectMarkers(projectPath) {
    const markers = [];
    if (fs.existsSync(path.join(projectPath, '.git'))) markers.push('git');
    if (fs.existsSync(path.join(projectPath, 'package.json'))) markers.push('node');
    if (fs.existsSync(path.join(projectPath, 'pubspec.yaml'))) markers.push('flutter');
    if (
      fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
      fs.existsSync(path.join(projectPath, 'requirements.txt'))
    ) {
      markers.push('python');
    }
    return markers;
  }
}
