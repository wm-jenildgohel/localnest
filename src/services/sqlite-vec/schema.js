export const SCHEMA_VERSION = 3;

export const INDEX_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS index_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    signature TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    preview TEXT NOT NULL,
    terms_json TEXT NOT NULL,
    term_count INTEGER NOT NULL DEFAULT 0,
    embedding_json TEXT,
    norm REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS term_df (
    term TEXT PRIMARY KEY,
    df INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS term_index (
    term TEXT NOT NULL,
    chunk_id TEXT NOT NULL,
    PRIMARY KEY (term, chunk_id)
  ) WITHOUT ROWID;

  CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
  CREATE INDEX IF NOT EXISTS idx_term_index_term ON term_index(term);
`;

export function runInTransaction(db, work) {
  db.exec('BEGIN');
  try {
    work();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function runMigrations(db, runInTransactionFn) {
  const current = Number.parseInt(
    db.prepare('SELECT value FROM index_meta WHERE key = ?').get('schema_version')?.value || '0',
    10
  );
  const columns = db.prepare('PRAGMA table_info(chunks)').all();
  const hasTermCount = columns.some((c) => c.name === 'term_count');
  const hasEmbeddingJson = columns.some((c) => c.name === 'embedding_json');

  if (!hasTermCount) {
    db.exec('ALTER TABLE chunks ADD COLUMN term_count INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE chunks SET term_count = 0 WHERE term_count IS NULL');
  }
  if (!hasEmbeddingJson) {
    db.exec('ALTER TABLE chunks ADD COLUMN embedding_json TEXT');
  }

  if (current >= SCHEMA_VERSION) return;

  if (current < 2) {
    // v0/v1 → v2: tokenizer changed — clear all indexed data so stale entries
    // don't pollute search results. Agents must re-run index_project.
    runInTransactionFn(() => {
      db.exec('DELETE FROM chunks');
      db.exec('DELETE FROM term_df');
      db.exec('DELETE FROM term_index');
      db.exec('DELETE FROM files');
    });
  }

  if (current < 3) {
    // v2 → v3: initialize term_count to keep BM25 length normalization stable.
    const rows = db.prepare('SELECT id, terms_json FROM chunks').all();
    const update = db.prepare('UPDATE chunks SET term_count = ? WHERE id = ?');
    runInTransactionFn(() => {
      for (const row of rows) {
        let count = 0;
        try {
          const pairs = JSON.parse(row.terms_json || '[]');
          for (const [, tf] of pairs) count += Number(tf) || 0;
        } catch {
          count = 0;
        }
        update.run(Math.max(1, count), row.id);
      }
    });
  }

  db.prepare('INSERT OR REPLACE INTO index_meta(key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
}
