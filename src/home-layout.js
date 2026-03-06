import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function resolveLocalnestHome(env = process.env) {
  return path.resolve(env.LOCALNEST_HOME || path.join(os.homedir(), '.localnest'));
}

export function buildLocalnestPaths(localnestHome) {
  const home = path.resolve(localnestHome);
  const configDir = path.join(home, 'config');
  const dataDir = path.join(home, 'data');
  const cacheDir = path.join(home, 'cache');
  const backupsDir = path.join(home, 'backups');

  return {
    home,
    dirs: {
      config: configDir,
      data: dataDir,
      cache: cacheDir,
      backups: backupsDir
    },
    configPath: path.join(configDir, 'localnest.config.json'),
    legacyConfigPath: path.join(home, 'localnest.config.json'),
    legacyCompatConfigPath: path.join(home, 'config.json'),
    snippetPath: path.join(configDir, 'mcp.localnest.json'),
    legacySnippetPath: path.join(home, 'mcp.localnest.json'),
    sqliteDbPath: path.join(dataDir, 'localnest.db'),
    legacySqliteDbPath: path.join(home, 'localnest.db'),
    jsonIndexPath: path.join(dataDir, 'localnest.index.json'),
    legacyJsonIndexPath: path.join(home, 'localnest.index.json'),
    memoryDbPath: path.join(dataDir, 'localnest.memory.db'),
    legacyMemoryDbPath: path.join(home, 'localnest.memory.db'),
    updateStatusPath: path.join(cacheDir, 'update-status.json'),
    legacyUpdateStatusPath: path.join(home, 'update-status.json')
  };
}

function sanitizeOwnerToken(input) {
  return String(input || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'user';
}

function writeProbeFile(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  const probe = path.join(dirPath, `.localnest-cache-probe-${process.pid}-${Date.now()}`);
  fs.writeFileSync(probe, 'ok', 'utf8');
  fs.rmSync(probe, { force: true });
}

export function resolveWritableModelCacheDir({ preferredDir, localnestHome, env = process.env } = {}) {
  const preferred = path.resolve(preferredDir || path.join(resolveLocalnestHome(env), 'cache'));
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  const owner = Number.isInteger(uid) ? `uid-${uid}` : sanitizeOwnerToken(env.USER || env.USERNAME || 'user');
  const fallbackBase = path.join(os.tmpdir(), `localnest-models-${owner}`);
  const fallbackShared = path.join(os.tmpdir(), 'localnest-models');
  const candidates = Array.from(new Set([
    preferred,
    localnestHome ? path.join(path.resolve(localnestHome), 'cache') : null,
    fallbackBase,
    fallbackShared
  ].filter(Boolean).map((candidate) => path.resolve(candidate))));

  for (const candidate of candidates) {
    try {
      writeProbeFile(candidate);
      return {
        path: candidate,
        preferredPath: preferred,
        writable: true,
        fallbackUsed: candidate !== preferred
      };
    } catch {
      // Try next candidate.
    }
  }

  return {
    path: preferred,
    preferredPath: preferred,
    writable: false,
    fallbackUsed: false
  };
}

function moveIfNeeded(source, target) {
  if (!fs.existsSync(source)) return false;
  if (fs.existsSync(target)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(source, target);
  return true;
}

function moveSqliteFamily(baseSource, baseTarget) {
  let moved = false;
  const suffixes = ['', '-wal', '-shm'];
  for (const suffix of suffixes) {
    moved = moveIfNeeded(`${baseSource}${suffix}`, `${baseTarget}${suffix}`) || moved;
  }
  return moved;
}

export function resolveConfigPath({ env = process.env, localnestHome } = {}) {
  const home = localnestHome || resolveLocalnestHome(env);
  const paths = buildLocalnestPaths(home);
  if (env.LOCALNEST_CONFIG) {
    const explicit = path.resolve(env.LOCALNEST_CONFIG);
    if (fs.existsSync(explicit)) return explicit;
    if (
      explicit === paths.legacyConfigPath ||
      explicit === paths.legacyCompatConfigPath
    ) {
      if (fs.existsSync(paths.configPath)) return paths.configPath;
    }
    return explicit;
  }
  if (fs.existsSync(paths.configPath)) return paths.configPath;
  if (fs.existsSync(paths.legacyConfigPath)) return paths.legacyConfigPath;
  return paths.configPath;
}

export function migrateLocalnestHomeLayout(localnestHome) {
  const paths = buildLocalnestPaths(localnestHome);
  fs.mkdirSync(paths.home, { recursive: true });
  fs.mkdirSync(paths.dirs.config, { recursive: true });
  fs.mkdirSync(paths.dirs.data, { recursive: true });
  fs.mkdirSync(paths.dirs.cache, { recursive: true });
  fs.mkdirSync(paths.dirs.backups, { recursive: true });

  let moved = false;

  moved = moveIfNeeded(paths.legacyConfigPath, paths.configPath) || moved;
  moved = moveIfNeeded(paths.legacySnippetPath, paths.snippetPath) || moved;
  moved = moveIfNeeded(paths.legacyUpdateStatusPath, paths.updateStatusPath) || moved;
  moved = moveIfNeeded(paths.legacyJsonIndexPath, paths.jsonIndexPath) || moved;
  moved = moveIfNeeded(paths.legacyCompatConfigPath, path.join(paths.dirs.backups, 'config.json')) || moved;
  moved = moveSqliteFamily(paths.legacySqliteDbPath, paths.sqliteDbPath) || moved;
  moved = moveSqliteFamily(paths.legacyMemoryDbPath, paths.memoryDbPath) || moved;

  const entries = fs.readdirSync(paths.home, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith('localnest.config.json.bak.')) continue;
    moved = moveIfNeeded(
      path.join(paths.home, entry.name),
      path.join(paths.dirs.backups, entry.name)
    ) || moved;
  }

  return {
    changed: moved,
    paths
  };
}
