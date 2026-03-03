import fs from 'node:fs';
import path from 'node:path';
import { buildLocalnestPaths } from '../home-layout.js';

function backupFile(configPath, localnestHome) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = buildLocalnestPaths(localnestHome).dirs.backups;
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${path.basename(configPath)}.bak.${stamp}`);
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

function safeWriteJson(filePath, value) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function defaultIndex(localnestHome) {
  const layout = buildLocalnestPaths(localnestHome);
  return {
    backend: 'sqlite-vec',
    dbPath: layout.sqliteDbPath,
    indexPath: layout.jsonIndexPath,
    chunkLines: 60,
    chunkOverlap: 15,
    maxTermsPerChunk: 80,
    maxIndexedFiles: 20000
  };
}

function defaultMemory(localnestHome) {
  const layout = buildLocalnestPaths(localnestHome);
  return {
    enabled: false,
    backend: 'auto',
    dbPath: layout.memoryDbPath,
    autoCapture: false,
    askForConsentDone: false
  };
}

export function ensureConfigUpgraded({ configPath, localnestHome }) {
  if (!configPath || !fs.existsSync(configPath)) {
    return { changed: false, reason: 'missing' };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { changed: false, reason: 'invalid-json' };
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.roots)) {
    return { changed: false, reason: 'invalid-shape' };
  }

  const currentVersion = Number.isFinite(parsed.version) ? parsed.version : 1;
  let changed = false;

  if (currentVersion < 2) {
    parsed.version = 2;
    changed = true;
  }

  if (!parsed.index || typeof parsed.index !== 'object') {
    parsed.index = defaultIndex(localnestHome);
    changed = true;
  } else {
    const defaults = defaultIndex(localnestHome);
    for (const [k, v] of Object.entries(defaults)) {
      if (parsed.index[k] === undefined || parsed.index[k] === null || parsed.index[k] === '') {
        parsed.index[k] = v;
        changed = true;
      }
    }
  }

  if (currentVersion < 3) {
    parsed.version = 3;
    changed = true;
  }

  if (!parsed.memory || typeof parsed.memory !== 'object') {
    parsed.memory = defaultMemory(localnestHome);
    changed = true;
  } else {
    const defaults = defaultMemory(localnestHome);
    for (const [k, v] of Object.entries(defaults)) {
      if (parsed.memory[k] === undefined || parsed.memory[k] === null || parsed.memory[k] === '') {
        parsed.memory[k] = v;
        changed = true;
      }
    }
  }

  if (!changed) {
    return { changed: false, reason: 'up-to-date', version: parsed.version };
  }

  const backupPath = backupFile(configPath, localnestHome);
  safeWriteJson(configPath, parsed);
  return {
    changed: true,
    version: parsed.version,
    backupPath
  };
}
