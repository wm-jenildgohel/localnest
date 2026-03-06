import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { expandHome } from '../../config.js';

export function normalizeTarget(workspace, inputPath) {
  const maybeExpanded = expandHome(inputPath);
  const resolved = path.isAbsolute(maybeExpanded)
    ? path.resolve(maybeExpanded)
    : path.resolve(workspace.roots[0].path, maybeExpanded);

  if (!isUnderRoots(workspace, resolved)) {
    throw new Error('Path is outside configured roots');
  }

  return resolved;
}

export function resolveSearchBases(workspace, projectPath, allRoots) {
  if (projectPath) {
    return [normalizeTarget(workspace, projectPath)];
  }

  const rawBases = allRoots ? workspace.roots.map((r) => r.path) : [workspace.roots[0].path];
  if (!workspace.autoProjectSplit) return rawBases;

  const expanded = [];
  for (const base of rawBases) {
    expanded.push(...splitRootIntoProjects(workspace, base));
  }
  return expanded;
}

export function listProjects(workspace, rootPath, maxEntries) {
  const root = rootPath ? normalizeTarget(workspace, rootPath) : workspace.roots[0].path;
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
      markers: detectProjectMarkers(projectPath).join(',')
    });
  }

  return result;
}

export function projectTree(workspace, projectPath, maxDepth, maxEntries) {
  const root = normalizeTarget(workspace, projectPath);
  const st = fs.statSync(root);
  if (!st.isDirectory()) {
    throw new Error('project_path is not a directory');
  }

  const rootParts = root.split(path.sep).length;
  const lines = [];

  for (const { current, files } of walkDirectories(workspace, root)) {
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

export function summarizeProject(workspace, projectPath, maxFiles) {
  const root = normalizeTarget(workspace, projectPath);
  const st = fs.statSync(root);
  if (!st.isDirectory()) {
    throw new Error('project_path is not a directory');
  }

  const counts = new Map();
  let totalFiles = 0;
  let totalDirs = 0;

  for (const { dirs, files } of walkDirectories(workspace, root)) {
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

export async function readFileChunk(workspace, requestedPath, startLine, endLine, maxSpan) {
  let from = startLine;
  let to = endLine;

  if (to < from) to = from;
  if (to - from + 1 > maxSpan) {
    to = from + maxSpan - 1;
  }

  const target = normalizeTarget(workspace, requestedPath);
  const st = fs.statSync(target);
  if (!st.isFile()) {
    throw new Error('path is not a file');
  }

  if (st.size > workspace.maxFileBytes) {
    const { lines, totalLines } = await readLinesWindowStream(target, from, to);
    const numbered = lines.map((line, idx) => `${from + idx}: ${line}`).join('\n');
    return {
      path: target,
      start_line: from,
      end_line: Math.min(to, totalLines),
      total_lines: totalLines,
      content: numbered,
      warning: `File exceeds cap (${st.size} bytes > ${workspace.maxFileBytes} bytes). Returned streamed line-window content only.`,
      file_size_bytes: st.size,
      cap_bytes: workspace.maxFileBytes
    };
  }

  const content = safeReadText(workspace, target);
  const allLines = content.split(/\r?\n/);
  const selected = allLines.slice(from - 1, to);
  const numbered = selected.map((line, idx) => `${from + idx}: ${line}`).join('\n');

  return {
    path: target,
    start_line: from,
    end_line: Math.min(to, allLines.length),
    total_lines: allLines.length,
    content: numbered
  };
}

export async function readLinesWindowStream(filePath, from, to) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  const lines = [];
  let lineNo = 0;
  try {
    for await (const line of rl) {
      lineNo += 1;
      if (lineNo >= from && lineNo <= to) {
        lines.push(line);
      }
    }
  } finally {
    rl.close();
  }

  return { lines, totalLines: lineNo };
}

export function *walkDirectories(workspace, base) {
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
        if (!workspace.ignoreDirs.has(entry.name)) dirs.push(full);
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

export function isLikelyTextFile(workspace, filePath) {
  return workspace.textExtensions.has(path.extname(filePath).toLowerCase());
}

export function safeReadText(workspace, filePath) {
  const st = fs.statSync(filePath);
  if (st.size > workspace.maxFileBytes) {
    throw new Error(`File too large (${st.size} bytes). Limit: ${workspace.maxFileBytes} bytes`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

export function isUnderRoots(workspace, targetPath) {
  const resolved = path.resolve(targetPath);
  return workspace.roots.some((root) => {
    const rel = path.relative(root.path, resolved);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

export function splitRootIntoProjects(workspace, rootPath) {
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
    if (workspace.ignoreDirs.has(entry.name)) continue;

    const full = path.join(rootPath, entry.name);
    candidateChildren.push(full);
    if (!looksLikeProjectDir(workspace, full)) continue;
    projects.push(full);
    if (projects.length >= workspace.maxAutoProjects) break;
  }

  if (projects.length === 0 && workspace.forceSplitChildren) {
    return candidateChildren.slice(0, workspace.maxAutoProjects);
  }

  return projects.length > 0 ? projects : [rootPath];
}

export function looksLikeProjectDir(workspace, dirPath) {
  if (fs.existsSync(path.join(dirPath, '.git'))) return true;

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (workspace.projectMarkerFiles.has(entry.name)) return true;
    if (workspace.extraProjectMarkers.has(entry.name)) return true;
    if (entry.name.endsWith('.sln') || entry.name.endsWith('.csproj') || entry.name.endsWith('.xcodeproj')) {
      return true;
    }
  }

  let hintDirCount = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (workspace.projectHintDirs.has(entry.name)) {
      hintDirCount += 1;
      if (hintDirCount >= 2) return true;
    }
  }

  return false;
}

export function detectProjectMarkers(projectPath) {
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
