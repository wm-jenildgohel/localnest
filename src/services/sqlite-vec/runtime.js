import fs from 'node:fs';
import { makeFileSignature } from './helpers.js';

export function tryLoadSqliteVec(service) {
  service.sqliteVecLoadAttempted = false;
  service.sqliteVecLoadError = '';
  service.sqliteVecTableReady = false;
  service.sqliteVecTableError = '';
  if (!service.sqliteVecExtensionPath) {
    service.sqliteVecLoaded = false;
    return;
  }
  try {
    service.sqliteVecLoadAttempted = true;
    if (typeof service.db.enableLoadExtension === 'function') {
      service.db.enableLoadExtension(true);
    }
    if (typeof service.db.loadExtension === 'function') {
      service.db.loadExtension(service.sqliteVecExtensionPath);
      service.sqliteVecLoaded = true;
      service.sqliteVecLoadError = '';
    }
  } catch (error) {
    service.sqliteVecLoaded = false;
    service.sqliteVecLoadError = String(error?.message || error || '');
  }
}

export function ensureSqliteVecTable(service) {
  if (!service.sqliteVecLoaded) {
    service.sqliteVecTableReady = false;
    return;
  }
  try {
    service.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[${service.embeddingDimensions}])`);
    service.sqliteVecTableReady = true;
    service.sqliteVecTableError = '';
  } catch (error) {
    service.sqliteVecTableReady = false;
    service.sqliteVecTableError = String(error?.message || error || '');
  }
}

export function syncSqliteVecRowsFromChunks(service) {
  if (!service.sqliteVecTableReady) return;
  const rows = service.db.prepare(
    'SELECT rowid, embedding_json FROM chunks WHERE embedding_json IS NOT NULL AND embedding_json != \'\''
  ).all();
  const insertVec = service.db.prepare('INSERT OR REPLACE INTO vec_chunks(rowid, embedding) VALUES (?, ?)');
  service.runInTransaction(() => {
    service.db.exec('DELETE FROM vec_chunks');
    for (const row of rows) {
      insertVec.run(row.rowid, row.embedding_json);
    }
  });
}

export function getSqliteVecExtensionStatus(service) {
  if (!service.sqliteVecExtensionPath) {
    return { configured: false, attempted: false, loaded: null, status: 'not-configured', path: '' };
  }
  if (!service.sqliteVecLoadAttempted) {
    return { configured: true, attempted: false, loaded: null, status: 'not-attempted', path: service.sqliteVecExtensionPath };
  }
  return {
    configured: true,
    attempted: true,
    loaded: service.sqliteVecLoaded,
    status: service.sqliteVecLoaded ? 'loaded' : 'load-failed',
    path: service.sqliteVecExtensionPath,
    error: service.sqliteVecLoaded ? '' : service.sqliteVecLoadError,
    vec_table_ready: service.sqliteVecTableReady,
    vec_table_error: service.sqliteVecTableError || ''
  };
}

export function checkStaleness(service) {
  service.ensureDb();
  const rows = service.db.prepare('SELECT path, signature FROM files').all();
  let staleCount = 0;
  let deletedCount = 0;
  for (const row of rows) {
    try {
      const st = fs.statSync(row.path);
      if (makeFileSignature(st) !== row.signature) staleCount += 1;
    } catch {
      deletedCount += 1;
      staleCount += 1;
    }
  }
  return { stale: staleCount > 0, stale_count: staleCount, deleted_count: deletedCount, total_indexed: rows.length };
}
