#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const SERVER_NAME = 'localnest';
const SERVER_VERSION = '1.0.0';
const MCP_MODE = (process.env.MCP_MODE || 'stdio').toLowerCase();
const DISABLE_CONSOLE_OUTPUT = (process.env.DISABLE_CONSOLE_OUTPUT || '').toLowerCase() === 'true';

if (DISABLE_CONSOLE_OUTPUT) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.warn = () => {};
}

const DEFAULT_MAX_READ_LINES = 400;
const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const RG_TIMEOUT_MS = Number.parseInt(process.env.LOCALNEST_RG_TIMEOUT_MS || '15000', 10);

const IGNORE_DIRS = new Set([
  '.git',
  '.idea',
  '.vscode',
  'node_modules',
  'build',
  'dist',
  '.dart_tool',
  '.next',
  '.turbo',
  'target',
  'coverage',
  'venv',
  '.venv',
  '__pycache__'
]);

const TEXT_EXTENSIONS = new Set([
  '.py', '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt',
  '.yaml', '.yml', '.toml', '.ini', '.sh', '.bash', '.zsh',
  '.dart', '.java', '.kt', '.kts', '.swift', '.go', '.rs',
  '.c', '.h', '.hpp', '.cpp', '.cs', '.rb', '.php', '.sql',
  '.graphql', '.proto', '.xml', '.html', '.css', '.scss'
]);

function expandHome(inputPath) {
  return inputPath.replace(/^~(?=$|\/)/, `${process.env.HOME || ''}`);
}

function normalizeRootEntry(label, rootPath) {
  const resolved = path.resolve(expandHome(rootPath));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return null;
  }

  return {
    label: (label || path.basename(resolved) || 'root').trim(),
    path: resolved
  };
}

function parseProjectRootsEnv() {
  const raw = (process.env.PROJECT_ROOTS || '').trim();
  if (!raw) return [];

  const roots = [];
  for (const entry of raw.split(';').map((x) => x.trim()).filter(Boolean)) {
    let label;
    let rootPath;

    if (entry.includes('=')) {
      const idx = entry.indexOf('=');
      label = entry.slice(0, idx).trim();
      rootPath = entry.slice(idx + 1).trim();
    } else {
      rootPath = entry;
      label = path.basename(rootPath) || 'root';
    }

    const normalized = normalizeRootEntry(label, rootPath);
    if (normalized) roots.push(normalized);
  }

  return roots;
}

function parseConfigFileRoots() {
  const configPath = path.resolve(process.env.LOCALNEST_CONFIG || 'localnest.config.json');
  if (!fs.existsSync(configPath)) return [];

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return [];
  }

  if (!parsed || !Array.isArray(parsed.roots)) {
    return [];
  }

  const roots = [];
  for (const item of parsed.roots) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.path !== 'string') continue;
    const normalized = normalizeRootEntry(
      typeof item.label === 'string' ? item.label : undefined,
      item.path
    );
    if (normalized) roots.push(normalized);
  }

  return roots;
}

function parseRoots() {
  const envRoots = parseProjectRootsEnv();
  if (envRoots.length > 0) return envRoots;

  const configRoots = parseConfigFileRoots();
  if (configRoots.length > 0) return configRoots;

  const cwd = path.resolve(process.cwd());
  return [{ label: path.basename(cwd) || 'cwd', path: cwd }];
}

const ROOTS = parseRoots();
const HAS_RG = (() => {
  try {
    const result = spawnSync('rg', ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
})();

function isUnderRoots(targetPath) {
  const resolved = path.resolve(targetPath);
  return ROOTS.some((root) => {
    const rel = path.relative(root.path, resolved);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

function normalizeTarget(inputPath) {
  const maybeExpanded = expandHome(inputPath);
  const resolved = path.isAbsolute(maybeExpanded)
    ? path.resolve(maybeExpanded)
    : path.resolve(ROOTS[0].path, maybeExpanded);

  if (!isUnderRoots(resolved)) {
    throw new Error('Path is outside configured roots');
  }

  return resolved;
}

function resolveSearchBases(projectPath, allRoots) {
  if (projectPath) {
    return [normalizeTarget(projectPath)];
  }
  if (allRoots) {
    return ROOTS.map((r) => r.path);
  }
  return [ROOTS[0].path];
}

function* walkDirectories(base) {
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
      if (entry.name.startsWith('.')) {
        continue;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          dirs.push(full);
        }
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

function isLikelyTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function safeReadText(filePath) {
  const st = fs.statSync(filePath);
  if (st.size > DEFAULT_MAX_FILE_BYTES) {
    throw new Error(`File too large (${st.size} bytes). Limit: ${DEFAULT_MAX_FILE_BYTES} bytes`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function fastSearchWithRipgrep({ query, base, glob, caseSensitive, maxResults }) {
  const args = [
    '--line-number',
    '--no-heading',
    '--color',
    'never',
    '--fixed-strings',
    '--max-filesize',
    `${Math.max(1, Math.floor(DEFAULT_MAX_FILE_BYTES / 1024))}K`
  ];

  if (!caseSensitive) {
    args.push('-i');
  }
  if (glob && glob !== '*') {
    args.push('--glob', glob);
  }

  for (const ignored of IGNORE_DIRS) {
    args.push('--glob', `!**/${ignored}/**`);
  }

  args.push(query, base);

  const run = spawnSync('rg', args, {
    encoding: 'utf8',
    timeout: RG_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024
  });

  if (run.error) {
    throw run.error;
  }

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

function toolResult(data) {
  return {
    structuredContent: { data },
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION
});

server.registerTool(
  'list_roots',
  {
    title: 'List Roots',
    description: 'List configured local roots available to this MCP server.',
    inputSchema: {},
    outputSchema: {
      data: z.any()
    }
  },
  async () => {
    return toolResult(ROOTS);
  }
);

server.registerTool(
  'list_projects',
  {
    title: 'List Projects',
    description: 'List first-level project directories under a root.',
    inputSchema: {
      root_path: z.string().optional(),
      max_entries: z.number().int().min(1).max(2000).default(300)
    },
    outputSchema: {
      data: z.any()
    }
  },
  async ({ root_path, max_entries }) => {
    const root = root_path ? normalizeTarget(root_path) : ROOTS[0].path;
    const st = fs.statSync(root);
    if (!st.isDirectory()) {
      throw new Error('root_path is not a directory');
    }

    const entries = fs.readdirSync(root, { withFileTypes: true });
    const result = [];

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (result.length >= max_entries) break;
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const projectPath = path.join(root, entry.name);
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

      result.push({
        name: entry.name,
        path: projectPath,
        markers: markers.join(',')
      });
    }

    return toolResult(result);
  }
);

server.registerTool(
  'project_tree',
  {
    title: 'Project Tree',
    description: 'Return a compact tree of files/directories for a project path.',
    inputSchema: {
      project_path: z.string(),
      max_depth: z.number().int().min(1).max(8).default(3),
      max_entries: z.number().int().min(1).max(10000).default(1500)
    },
    outputSchema: {
      data: z.any()
    }
  },
  async ({ project_path, max_depth, max_entries }) => {
    const root = normalizeTarget(project_path);
    const st = fs.statSync(root);
    if (!st.isDirectory()) {
      throw new Error('project_path is not a directory');
    }

    const rootParts = root.split(path.sep).length;
    const lines = [];

    for (const { current, dirs, files } of walkDirectories(root)) {
      const depth = current.split(path.sep).length - rootParts;
      if (depth > max_depth) continue;

      const indent = '  '.repeat(depth);
      if (depth > 0) {
        lines.push(`${indent}${path.basename(current)}/`);
      }

      for (const filePath of files.sort((a, b) => a.localeCompare(b))) {
        lines.push(`${indent}  ${path.basename(filePath)}`);
        if (lines.length >= max_entries) {
          return toolResult(lines.slice(0, max_entries));
        }
      }

      if (lines.length >= max_entries) {
        return toolResult(lines.slice(0, max_entries));
      }
    }

    return toolResult(lines);
  }
);

server.registerTool(
  'search_code',
  {
    title: 'Search Code',
    description: 'Search text across files under a project/root and return matching lines.',
    inputSchema: {
      query: z.string().min(1),
      project_path: z.string().optional(),
      all_roots: z.boolean().default(false),
      glob: z.string().default('*'),
      max_results: z.number().int().min(1).max(1000).default(DEFAULT_MAX_RESULTS),
      case_sensitive: z.boolean().default(false)
    },
    outputSchema: {
      data: z.any()
    }
  },
  async ({ query, project_path, all_roots, glob, max_results, case_sensitive }) => {
    const bases = resolveSearchBases(project_path, all_roots);

    for (const base of bases) {
      const st = fs.statSync(base);
      if (!st.isDirectory()) {
        throw new Error('project_path is not a directory');
      }
    }

    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), case_sensitive ? '' : 'i');
    const wildcardPattern = new RegExp(
      `^${glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}$`
    );

    const matches = [];
    for (const base of bases) {
      if (HAS_RG) {
        try {
          const fastMatches = fastSearchWithRipgrep({
            query,
            base,
            glob,
            caseSensitive: case_sensitive,
            maxResults: max_results - matches.length
          });

          matches.push(...fastMatches);
          if (matches.length >= max_results) {
            return toolResult(matches.slice(0, max_results));
          }
          continue;
        } catch {
          // Fall back to pure JS walk if rg fails at runtime.
        }
      }

      for (const { files } of walkDirectories(base)) {
        for (const filePath of files) {
          if (!isLikelyTextFile(filePath)) continue;

          const rel = path.relative(base, filePath).split(path.sep).join('/');
          if (!wildcardPattern.test(rel)) continue;

          let text;
          try {
            text = safeReadText(filePath);
          } catch {
            continue;
          }

          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i += 1) {
            if (!regex.test(lines[i])) continue;
            matches.push({ file: filePath, line: i + 1, text: lines[i].trim() });
            if (matches.length >= max_results) {
              return toolResult(matches.slice(0, max_results));
            }
          }
        }
      }
    }

    return toolResult(matches.slice(0, max_results));
  }
);

server.registerTool(
  'read_file',
  {
    title: 'Read File',
    description: 'Read a bounded chunk of a file with line numbers.',
    inputSchema: {
      path: z.string(),
      start_line: z.number().int().min(1).default(1),
      end_line: z.number().int().min(1).default(DEFAULT_MAX_READ_LINES)
    },
    outputSchema: {
      data: z.any()
    }
  },
  async ({ path: requestedPath, start_line, end_line }) => {
    let startLine = start_line;
    let endLine = end_line;

    if (endLine < startLine) endLine = startLine;
    const maxSpan = 800;
    if (endLine - startLine + 1 > maxSpan) {
      endLine = startLine + maxSpan - 1;
    }

    const target = normalizeTarget(requestedPath);
    const st = fs.statSync(target);
    if (!st.isFile()) {
      throw new Error('path is not a file');
    }

    const content = safeReadText(target);
    const lines = content.split(/\r?\n/);
    const selected = lines.slice(startLine - 1, endLine);
    const numbered = selected.map((line, idx) => `${startLine + idx}: ${line}`).join('\n');

    return toolResult({
      path: target,
      start_line: startLine,
      end_line: Math.min(endLine, lines.length),
      total_lines: lines.length,
      content: numbered
    });
  }
);

server.registerTool(
  'summarize_project',
  {
    title: 'Summarize Project',
    description: 'Return a high-level summary of a project directory.',
    inputSchema: {
      project_path: z.string(),
      max_files: z.number().int().min(100).max(20000).default(3000)
    },
    outputSchema: {
      data: z.any()
    }
  },
  async ({ project_path, max_files }) => {
    const root = normalizeTarget(project_path);
    const st = fs.statSync(root);
    if (!st.isDirectory()) {
      throw new Error('project_path is not a directory');
    }

    const counts = new Map();
    let totalFiles = 0;
    let totalDirs = 0;

    for (const { dirs, files } of walkDirectories(root)) {
      totalDirs += dirs.length;

      for (const filePath of files) {
        if (path.basename(filePath).startsWith('.')) continue;
        totalFiles += 1;

        const ext = path.extname(filePath).toLowerCase() || '<none>';
        counts.set(ext, (counts.get(ext) || 0) + 1);

        if (totalFiles >= max_files) break;
      }

      if (totalFiles >= max_files) break;
    }

    const topExtensions = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([ext, count]) => ({ ext, count }));

    return toolResult({
      path: root,
      directories: totalDirs,
      files_counted: totalFiles,
      top_extensions: topExtensions,
      truncated: totalFiles >= max_files
    });
  }
);

async function main() {
  if (MCP_MODE !== 'stdio') {
    throw new Error('Unsupported MCP_MODE. Use MCP_MODE=stdio for MCP clients.');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[localnest-mcp] fatal:', error);
  process.exit(1);
});
