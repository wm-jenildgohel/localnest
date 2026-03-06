import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureConfigUpgraded } from './migrations/config-migrator.js';
import {
  migrateLocalnestHomeLayout,
  resolveConfigPath as resolveDefaultConfigPath,
  resolveLocalnestHome,
  resolveWritableModelCacheDir
} from './home-layout.js';

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntEnvClamped(value, fallback, min, max) {
  const parsed = parseIntEnv(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function parseStringEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim();
}

export const SERVER_NAME = 'localnest';
export const SERVER_VERSION = '0.0.4-beta.5';

export const DEFAULT_MAX_READ_LINES = 400;
export const DEFAULT_MAX_RESULTS = 100;
export const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
export const DEFAULT_MAX_INDEX_FILES = 20000;

export const IGNORE_DIRS = new Set([
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

export const PROJECT_MARKER_FILES = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'pubspec.yaml',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'poetry.lock',
  'setup.py',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradle.properties',
  'go.mod',
  'Cargo.toml',
  '.sln',
  'Gemfile',
  'composer.json',
  'Package.swift',
  'CMakeLists.txt',
  'Makefile',
  'meson.build'
]);

export const PROJECT_HINT_DIRS = new Set([
  'src',
  'lib',
  'app',
  'apps',
  'packages',
  'modules',
  'cmd',
  'android',
  'ios',
  'web',
  'test',
  'tests'
]);

export const TEXT_EXTENSIONS = new Set([
  '.py', '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt',
  '.yaml', '.yml', '.toml', '.ini', '.sh', '.bash', '.zsh',
  '.dart', '.java', '.kt', '.kts', '.swift', '.go', '.rs',
  '.c', '.h', '.hpp', '.cpp', '.cs', '.rb', '.php', '.sql',
  '.graphql', '.proto', '.xml', '.html', '.css', '.scss'
]);

export function expandHome(inputPath) {
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

function parseProjectRootsEnv(projectRoots) {
  const raw = (projectRoots || '').trim();
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

function parseConfigFileRoots(configPath) {
  const resolvedPath = path.resolve(configPath || 'localnest.config.json');
  if (!fs.existsSync(resolvedPath)) return [];

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
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

function parseConfigFileSettings(configPath) {
  const resolvedPath = path.resolve(configPath || 'localnest.config.json');
  if (!fs.existsSync(resolvedPath)) return {};

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object') return {};

  const index = parsed.index && typeof parsed.index === 'object' ? parsed.index : {};
  const memory = parsed.memory && typeof parsed.memory === 'object' ? parsed.memory : {};

  return {
    backend: typeof index.backend === 'string' ? index.backend : undefined,
    dbPath: typeof index.dbPath === 'string' ? index.dbPath : undefined,
    indexPath: typeof index.indexPath === 'string' ? index.indexPath : undefined,
    chunkLines: Number.isFinite(index.chunkLines) ? index.chunkLines : undefined,
    chunkOverlap: Number.isFinite(index.chunkOverlap) ? index.chunkOverlap : undefined,
    maxTermsPerChunk: Number.isFinite(index.maxTermsPerChunk) ? index.maxTermsPerChunk : undefined,
    maxIndexedFiles: Number.isFinite(index.maxIndexedFiles) ? index.maxIndexedFiles : undefined,
    sqliteVecExtensionPath: typeof index.sqliteVecExtensionPath === 'string'
      ? index.sqliteVecExtensionPath
      : undefined,
    embeddingProvider: typeof index.embeddingProvider === 'string' ? index.embeddingProvider : undefined,
    embeddingModel: typeof index.embeddingModel === 'string' ? index.embeddingModel : undefined,
    embeddingCacheDir: typeof index.embeddingCacheDir === 'string' ? index.embeddingCacheDir : undefined,
    embeddingDimensions: Number.isFinite(index.embeddingDimensions) ? index.embeddingDimensions : undefined,
    rerankerProvider: typeof index.rerankerProvider === 'string' ? index.rerankerProvider : undefined,
    rerankerModel: typeof index.rerankerModel === 'string' ? index.rerankerModel : undefined,
    rerankerCacheDir: typeof index.rerankerCacheDir === 'string' ? index.rerankerCacheDir : undefined,
    memoryEnabled: typeof memory.enabled === 'boolean' ? memory.enabled : undefined,
    memoryBackend: typeof memory.backend === 'string' ? memory.backend : undefined,
    memoryDbPath: typeof memory.dbPath === 'string' ? memory.dbPath : undefined,
    memoryAutoCapture: typeof memory.autoCapture === 'boolean' ? memory.autoCapture : undefined,
    memoryConsentDone: typeof memory.askForConsentDone === 'boolean' ? memory.askForConsentDone : undefined
  };
}

function resolveRoots({ projectRoots, localnestConfigPath }) {
  const envRoots = parseProjectRootsEnv(projectRoots);
  if (envRoots.length > 0) return envRoots;

  const fileRoots = parseConfigFileRoots(localnestConfigPath);
  if (fileRoots.length > 0) return fileRoots;

  const cwd = path.resolve(process.cwd());
  return [{ label: path.basename(cwd) || 'cwd', path: cwd }];
}

function detectRipgrep() {
  try {
    const result = spawnSync('rg', ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function buildRuntimeConfig(env = process.env) {
  const localnestHome = resolveLocalnestHome(env);
  const layout = migrateLocalnestHomeLayout(localnestHome).paths;
  const configPath = resolveDefaultConfigPath({ env, localnestHome });
  const migration = ensureConfigUpgraded({
    configPath: path.resolve(configPath),
    localnestHome
  });
  if (migration.changed && migration.backupPath) {
    process.stderr.write(
      `[localnest-config] migrated to version ${migration.version}; backup: ${migration.backupPath}\n`
    );
  }
  const fileSettings = parseConfigFileSettings(configPath);
  const embeddingCachePreferred = path.resolve(
    env.LOCALNEST_EMBED_CACHE_DIR || fileSettings.embeddingCacheDir || layout.dirs.cache
  );
  const rerankerCachePreferred = path.resolve(
    env.LOCALNEST_RERANKER_CACHE_DIR || fileSettings.rerankerCacheDir || layout.dirs.cache
  );
  const embeddingCacheResolved = resolveWritableModelCacheDir({
    preferredDir: embeddingCachePreferred,
    localnestHome,
    env
  });
  const rerankerCacheResolved = resolveWritableModelCacheDir({
    preferredDir: rerankerCachePreferred,
    localnestHome,
    env
  });

  if (embeddingCacheResolved.fallbackUsed) {
    process.stderr.write(
      '[localnest-config] embedding cache fallback enabled due to unwritable preferred cache path\n'
    );
  }
  if (rerankerCacheResolved.fallbackUsed) {
    process.stderr.write(
      '[localnest-config] reranker cache fallback enabled due to unwritable preferred cache path\n'
    );
  }

  return {
    localnestHome,
    mcpMode: (env.MCP_MODE || 'stdio').toLowerCase(),
    disableConsoleOutput: parseBoolean(env.DISABLE_CONSOLE_OUTPUT, false),
    rgTimeoutMs: parseIntEnv(env.LOCALNEST_RG_TIMEOUT_MS, 15000),
    autoProjectSplit: parseBoolean(env.LOCALNEST_AUTO_PROJECT_SPLIT, true),
    maxAutoProjects: parseIntEnv(env.LOCALNEST_MAX_AUTO_PROJECTS, 120),
    forceSplitChildren: parseBoolean(env.LOCALNEST_FORCE_SPLIT_CHILDREN, false),
    indexBackend: parseStringEnv(env.LOCALNEST_INDEX_BACKEND, fileSettings.backend || 'sqlite-vec'),
    vectorIndexPath: path.resolve(
      env.LOCALNEST_INDEX_PATH || fileSettings.indexPath || layout.jsonIndexPath
    ),
    sqliteDbPath: path.resolve(
      env.LOCALNEST_DB_PATH || fileSettings.dbPath || layout.sqliteDbPath
    ),
    sqliteVecExtensionPath: parseStringEnv(
      env.LOCALNEST_SQLITE_VEC_EXTENSION,
      fileSettings.sqliteVecExtensionPath || ''
    ),
    vectorChunkLines: parseIntEnv(
      env.LOCALNEST_VECTOR_CHUNK_LINES,
      fileSettings.chunkLines || 60
    ),
    vectorChunkOverlap: parseIntEnv(
      env.LOCALNEST_VECTOR_CHUNK_OVERLAP,
      fileSettings.chunkOverlap || 15
    ),
    vectorMaxTermsPerChunk: parseIntEnv(
      env.LOCALNEST_VECTOR_MAX_TERMS,
      fileSettings.maxTermsPerChunk || 80
    ),
    vectorMaxIndexedFiles: parseIntEnv(
      env.LOCALNEST_VECTOR_MAX_FILES,
      fileSettings.maxIndexedFiles || DEFAULT_MAX_INDEX_FILES
    ),
    embeddingProvider: parseStringEnv(
      env.LOCALNEST_EMBED_PROVIDER,
      fileSettings.embeddingProvider || 'xenova'
    ),
    embeddingModel: parseStringEnv(
      env.LOCALNEST_EMBED_MODEL,
      fileSettings.embeddingModel || 'Xenova/all-MiniLM-L6-v2'
    ),
    embeddingCacheDir: embeddingCacheResolved.path,
    embeddingDimensions: parseIntEnv(
      env.LOCALNEST_EMBED_DIMS,
      fileSettings.embeddingDimensions || 384
    ),
    rerankerProvider: parseStringEnv(
      env.LOCALNEST_RERANKER_PROVIDER,
      fileSettings.rerankerProvider || 'xenova'
    ),
    rerankerModel: parseStringEnv(
      env.LOCALNEST_RERANKER_MODEL,
      fileSettings.rerankerModel || 'Xenova/ms-marco-MiniLM-L-6-v2'
    ),
    rerankerCacheDir: rerankerCacheResolved.path,
    updatePackageName: parseStringEnv(env.LOCALNEST_UPDATE_PACKAGE, 'localnest-mcp'),
    updateCheckIntervalMinutes: parseIntEnvClamped(
      env.LOCALNEST_UPDATE_CHECK_INTERVAL_MINUTES,
      120,
      15,
      1440
    ),
    updateFailureBackoffMinutes: parseIntEnvClamped(
      env.LOCALNEST_UPDATE_FAILURE_BACKOFF_MINUTES,
      15,
      5,
      240
    ),
    indexSweepIntervalMinutes: parseIntEnvClamped(
      env.LOCALNEST_INDEX_SWEEP_INTERVAL_MINUTES,
      5,
      0,
      1440
    ),
    extraProjectMarkers: new Set(
      (env.LOCALNEST_EXTRA_PROJECT_MARKERS || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    ),
    memoryEnabled: parseBoolean(env.LOCALNEST_MEMORY_ENABLED, fileSettings.memoryEnabled || false),
    memoryBackend: parseStringEnv(env.LOCALNEST_MEMORY_BACKEND, fileSettings.memoryBackend || 'auto'),
    memoryDbPath: path.resolve(
      env.LOCALNEST_MEMORY_DB_PATH || fileSettings.memoryDbPath || layout.memoryDbPath
    ),
    memoryAutoCapture: parseBoolean(env.LOCALNEST_MEMORY_AUTO_CAPTURE, fileSettings.memoryAutoCapture || false),
    memoryConsentDone: parseBoolean(env.LOCALNEST_MEMORY_CONSENT_DONE, fileSettings.memoryConsentDone || false),
    roots: resolveRoots({
      projectRoots: env.PROJECT_ROOTS,
      localnestConfigPath: configPath
    }),
    hasRipgrep: detectRipgrep()
  };
}

export function applyConsolePolicy(disableConsoleOutput) {
  if (!disableConsoleOutput) return;
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.warn = () => {};
}
