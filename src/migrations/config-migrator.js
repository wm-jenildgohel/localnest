import fs from 'node:fs';
import path from 'node:path';

function backupFile(configPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${configPath}.bak.${stamp}`;
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

function safeWriteJson(filePath, value) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function defaultIndex(localnestHome) {
  return {
    backend: 'sqlite-vec',
    dbPath: path.join(localnestHome, 'localnest.db'),
    indexPath: path.join(localnestHome, 'localnest.index.json'),
    chunkLines: 60,
    chunkOverlap: 15,
    maxTermsPerChunk: 80,
    maxIndexedFiles: 20000
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

  if (!changed) {
    return { changed: false, reason: 'up-to-date', version: parsed.version };
  }

  const backupPath = backupFile(configPath);
  safeWriteJson(configPath, parsed);
  return {
    changed: true,
    version: parsed.version,
    backupPath
  };
}
