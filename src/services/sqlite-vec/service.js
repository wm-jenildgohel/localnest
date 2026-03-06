import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildBaseScopeClause, makeFileSignature, isUnderBase } from './helpers.js';
import { INDEX_SCHEMA_SQL, runInTransaction, runMigrations } from './schema.js';
import {
  applyDfDeltaFromTerms, applyDfDeltaFromTermsJson,
  computeNorm, applyDfDeltas, refreshChunkNorms
} from './bm25.js';
import { collectFiles, chunkFile as chunkFileFn } from './indexer.js';
import { semanticSearch as semanticSearchFn } from './semantic-search.js';
import {
  tryLoadSqliteVec as tryLoadSqliteVecFn,
  ensureSqliteVecTable as ensureSqliteVecTableFn,
  syncSqliteVecRowsFromChunks as syncSqliteVecRowsFromChunksFn,
  getSqliteVecExtensionStatus as getSqliteVecExtensionStatusFn,
  checkStaleness as checkStalenessFn
} from './runtime.js';

// Re-export for callers that import buildBaseScopeClause from this module.
export { buildBaseScopeClause };

export class SqliteVecIndexService {
  constructor({
    workspace,
    dbPath,
    sqliteVecExtensionPath,
    chunkLines,
    chunkOverlap,
    maxTermsPerChunk,
    maxIndexedFiles,
    embeddingService,
    embeddingDimensions = 384,
    astChunker,
    bm25K1 = 1.2,
    bm25B = 0.75
  }) {
    this.workspace = workspace;
    this.dbPath = dbPath;
    this.sqliteVecExtensionPath = sqliteVecExtensionPath || '';
    this.chunkLines = chunkLines;
    this.chunkOverlap = chunkOverlap;
    this.maxTermsPerChunk = maxTermsPerChunk;
    this.maxIndexedFiles = maxIndexedFiles;
    this.embeddingService = embeddingService || null;
    this.embeddingDimensions = Math.max(1, Number(embeddingDimensions) || 384);
    this.astChunker = astChunker || null;
    this.bm25K1 = bm25K1;
    this.bm25B = bm25B;
    this.db = null;
    this.sqliteVecLoaded = false;
    this.sqliteVecLoadAttempted = false;
    this.sqliteVecLoadError = '';
    this.sqliteVecTableReady = false;
    this.sqliteVecTableError = '';
  }

  ensureDb() {
    if (this.db) return;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode=WAL;');
    this.db.exec('PRAGMA synchronous=NORMAL;');
    this.db.exec('PRAGMA cache_size=-8000;');
    this.db.exec(INDEX_SCHEMA_SQL);

    this._stmtGetDf = this.db.prepare('SELECT df FROM term_df WHERE term = ?');
    this._stmtSetMeta = this.db.prepare('INSERT OR REPLACE INTO index_meta(key, value) VALUES (?, ?)');
    this._stmtGetMeta = this.db.prepare('SELECT value FROM index_meta WHERE key = ?');

    this.setMeta('backend', 'sqlite-vec');
    this._runMigrations();
    this.tryLoadSqliteVec();
    this.ensureSqliteVecTable();
  }

  _runMigrations() {
    runMigrations(this.db, (work) => this.runInTransaction(work));
  }

  tryLoadSqliteVec() {
    return tryLoadSqliteVecFn(this);
  }

  ensureSqliteVecTable() {
    return ensureSqliteVecTableFn(this);
  }

  syncSqliteVecRowsFromChunks() {
    return syncSqliteVecRowsFromChunksFn(this);
  }

  getSqliteVecExtensionStatus() {
    return getSqliteVecExtensionStatusFn(this);
  }

  setMeta(key, value) {
    (this._stmtSetMeta || this.db.prepare('INSERT OR REPLACE INTO index_meta(key, value) VALUES (?, ?)')).run(key, String(value));
  }

  getMeta(key) {
    const row = (this._stmtGetMeta || this.db.prepare('SELECT value FROM index_meta WHERE key = ?')).get(key);
    return row ? row.value : null;
  }

  getDf(term) {
    const row = (this._stmtGetDf || this.db.prepare('SELECT df FROM term_df WHERE term = ?')).get(term);
    return row ? row.df : 0;
  }

  batchGetDf(terms) {
    if (terms.length === 0) return new Map();
    const placeholders = terms.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT term, df FROM term_df WHERE term IN (${placeholders})`).all(...terms);
    return new Map(rows.map((r) => [r.term, r.df]));
  }

  runInTransaction(work) {
    runInTransaction(this.db, work);
  }

  getStatus() {
    this.ensureDb();
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM files').get();
    const chunkRow = this.db.prepare('SELECT COUNT(*) AS c FROM chunks').get();
    const avgTermsRow = this.db.prepare('SELECT AVG(term_count) AS v FROM chunks').get();
    const extension = this.getSqliteVecExtensionStatus();
    return {
      backend: 'sqlite-vec',
      db_path: this.dbPath,
      sqlite_vec_loaded: extension.loaded,
      sqlite_vec_extension: extension,
      sqlite_vec_table_ready: this.sqliteVecTableReady,
      updated_at: this.getMeta('updated_at'),
      total_files: row?.c || 0,
      total_chunks: chunkRow?.c || 0,
      avg_chunk_terms: Number(avgTermsRow?.v || 0),
      upgrade_recommended: false,
      upgrade_reason: null,
      embedding: this.embeddingService?.getStatus?.() || { provider: 'none', enabled: false, available: false, model: null, dimensions: null },
      ast_chunking: this.astChunker?.getStatus?.() || { enabled: false, supported_languages: [], active_languages: [], fallback_languages: [], ast_chunks: 0, fallback_chunks: 0 }
    };
  }

  checkStaleness() {
    return checkStalenessFn(this);
  }

  async indexProject({ projectPath, allRoots, force, maxFiles, onProgress }) {
    this.ensureDb();
    const bases = this.workspace.resolveSearchBases(projectPath, allRoots).map((p) => this.workspace.normalizeTarget(p));
    const files = collectFiles(this.workspace, bases, maxFiles, this.maxIndexedFiles);
    const fileSet = new Set(files);
    const total = files.length;
    let completed = 0;
    let processed = 0;
    let skipped = 0;
    let removed = 0;
    const failedFiles = [];

    const stmtSelectSig = this.db.prepare('SELECT signature FROM files WHERE path = ?');
    const stmtSelectChunkTermsByFile = this.db.prepare('SELECT id, terms_json FROM chunks WHERE file_path = ?');
    const stmtDeleteTermIndexByFile = this.db.prepare('DELETE FROM term_index WHERE chunk_id IN (SELECT id FROM chunks WHERE file_path = ?)');
    const stmtDeleteChunks = this.db.prepare('DELETE FROM chunks WHERE file_path = ?');
    const stmtDeleteFile = this.db.prepare('DELETE FROM files WHERE path = ?');
    const stmtUpsertFile = this.db.prepare('INSERT OR REPLACE INTO files(path, signature, updated_at) VALUES (?, ?, ?)');
    const stmtInsertChunk = this.db.prepare(
      'INSERT OR REPLACE INTO chunks(id, file_path, start_line, end_line, preview, terms_json, term_count, embedding_json, norm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const stmtInsertTermIndex = this.db.prepare('INSERT OR IGNORE INTO term_index(term, chunk_id) VALUES (?, ?)');

    const existingRows = this.db.prepare('SELECT path FROM files').all();
    const beforeChunkCount = this.db.prepare('SELECT COUNT(*) AS c FROM chunks').get()?.c || 0;
    const deltaDf = new Map();
    let deltaTotalChunks = 0;

    // Phase 1: remove deleted/out-of-scope files
    this.runInTransaction(() => {
      for (const row of existingRows) {
        if (!isUnderBase(row.path, bases)) continue;
        if (!fileSet.has(row.path)) {
          const oldRows = stmtSelectChunkTermsByFile.all(row.path);
          for (const oldRow of oldRows) {
            applyDfDeltaFromTermsJson(oldRow.terms_json, -1, deltaDf);
          }
          deltaTotalChunks -= oldRows.length;
          stmtDeleteTermIndexByFile.run(row.path);
          stmtDeleteChunks.run(row.path);
          stmtDeleteFile.run(row.path);
          removed += 1;
        }
      }
    });

    // Phase 2: process each file independently
    for (const filePath of files) {
      try {
        const st = fs.statSync(filePath);
        const signature = makeFileSignature(st);
        const existing = stmtSelectSig.get(filePath);

        if (!force && existing && existing.signature === signature) {
          skipped += 1;
          continue;
        }

        const text = this.workspace.safeReadText(filePath);
        const chunks = await chunkFileFn(filePath, text, {
          astChunker: this.astChunker,
          embeddingService: this.embeddingService,
          chunkLines: this.chunkLines,
          chunkOverlap: this.chunkOverlap,
          maxTermsPerChunk: this.maxTermsPerChunk
        });
        const existingChunkRows = existing ? stmtSelectChunkTermsByFile.all(filePath) : [];

        if (existingChunkRows.length > 0) {
          for (const oldRow of existingChunkRows) {
            applyDfDeltaFromTermsJson(oldRow.terms_json, -1, deltaDf);
          }
          deltaTotalChunks -= existingChunkRows.length;
        }

        this.runInTransaction(() => {
          stmtDeleteTermIndexByFile.run(filePath);
          stmtDeleteChunks.run(filePath);
          stmtUpsertFile.run(filePath, signature, new Date().toISOString());
          for (const chunk of chunks) {
            applyDfDeltaFromTerms(chunk.terms, 1, deltaDf);
            stmtInsertChunk.run(
              chunk.id, filePath, chunk.start_line, chunk.end_line, chunk.preview,
              JSON.stringify(chunk.terms), chunk.term_count || 0,
              chunk.embedding ? JSON.stringify(chunk.embedding) : null, chunk.norm
            );
            for (const [term] of chunk.terms) {
              stmtInsertTermIndex.run(term, chunk.id);
            }
          }
        });

        deltaTotalChunks += chunks.length;
        processed += 1;
      } catch (err) {
        failedFiles.push({ path: filePath, error: String(err?.message || err) });
      } finally {
        completed += 1;
        if (typeof onProgress === 'function') {
          await onProgress({ scanned: completed, total, phase: 'indexing_files' });
        }
      }
    }

    const getDfFn = (term) => this.getDf(term);
    const runTxn = (work) => this.runInTransaction(work);
    const computeNormFn = (terms, totalChunks, dfFn) => computeNorm(terms, totalChunks, dfFn || getDfFn);

    applyDfDeltas(this.db, runTxn, deltaDf, getDfFn);
    const changedTerms = new Set(Array.from(deltaDf.entries()).filter(([, delta]) => delta !== 0).map(([term]) => term));
    refreshChunkNorms(this.db, runTxn, {
      changedTerms,
      totalChunksChanged: deltaTotalChunks !== 0,
      totalChunks: beforeChunkCount + deltaTotalChunks
    }, computeNormFn);

    if (this.sqliteVecTableReady) {
      try {
        this.syncSqliteVecRowsFromChunks();
      } catch (error) {
        this.sqliteVecTableReady = false;
        this.sqliteVecTableError = String(error?.message || error || '');
      }
    }
    this.setMeta('updated_at', new Date().toISOString());
    if (typeof onProgress === 'function') {
      await onProgress({ scanned: total, total, phase: 'finalizing_index' });
    }

    const status = this.getStatus();
    return {
      backend: 'sqlite-vec',
      bases,
      scanned_files: files.length,
      indexed_files: processed,
      skipped_files: skipped,
      removed_files: removed,
      failed_files: failedFiles,
      total_files: status.total_files,
      total_chunks: status.total_chunks,
      db_path: this.dbPath,
      sqlite_vec_loaded: status.sqlite_vec_loaded,
      sqlite_vec_extension: status.sqlite_vec_extension
    };
  }

  async semanticSearch(opts) {
    this.ensureDb();
    return semanticSearchFn(this.db, this.embeddingService, this.workspace, {
      sqliteVecTableReady: this.sqliteVecTableReady,
      sqliteVecTableError: this.sqliteVecTableError,
      maxTermsPerChunk: this.maxTermsPerChunk,
      bm25K1: this.bm25K1,
      bm25B: this.bm25B,
      onVecError: (err) => { this.sqliteVecTableError = err; }
    }, opts);
  }
}
