import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function tokenize(text) {
  const matches = text.toLowerCase().match(/[a-z_][a-z0-9_]{1,39}/g);
  return matches || [];
}

function toSparsePairs(tokens, maxTerms) {
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return Array.from(tf.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms);
}

function makeFileSignature(st) {
  return `${st.mtimeMs}:${st.size}`;
}

function isUnderBase(filePath, bases) {
  const abs = path.resolve(filePath);
  return bases.some((base) => {
    const rel = path.relative(base, abs);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

function stripTrailingSeparators(value) {
  return value.replace(/[\\/]+$/g, '');
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function buildBaseScopeClause(bases, column = 'file_path') {
  const clauses = [];
  const params = [];
  for (const base of bases) {
    const trimmed = stripTrailingSeparators(base);
    const slashDescendants = `${trimmed}/%`;
    const backslashDescendants = `${trimmed}\\%`;
    clauses.push(`(${column} = ? OR ${column} LIKE ? OR ${column} LIKE ?)`);
    params.push(base, slashDescendants, backslashDescendants);
  }
  return {
    where: clauses.length > 0 ? clauses.join(' OR ') : '1=0',
    params
  };
}

export class SqliteVecIndexService {
  constructor({
    workspace,
    dbPath,
    sqliteVecExtensionPath,
    chunkLines,
    chunkOverlap,
    maxTermsPerChunk,
    maxIndexedFiles
  }) {
    this.workspace = workspace;
    this.dbPath = dbPath;
    this.sqliteVecExtensionPath = sqliteVecExtensionPath || '';
    this.chunkLines = chunkLines;
    this.chunkOverlap = chunkOverlap;
    this.maxTermsPerChunk = maxTermsPerChunk;
    this.maxIndexedFiles = maxIndexedFiles;
    this.db = null;
    this.sqliteVecLoaded = false;
  }

  ensureDb() {
    if (this.db) return;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode=WAL;');
    this.db.exec('PRAGMA synchronous=NORMAL;');
    this.db.exec('PRAGMA cache_size=-8000;');

    this.db.exec(`
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
        norm REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS term_df (
        term TEXT PRIMARY KEY,
        df INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
    `);

    this._stmtGetDf = this.db.prepare('SELECT df FROM term_df WHERE term = ?');
    this._stmtSetMeta = this.db.prepare('INSERT OR REPLACE INTO index_meta(key, value) VALUES (?, ?)');
    this._stmtGetMeta = this.db.prepare('SELECT value FROM index_meta WHERE key = ?');

    this.tryLoadSqliteVec();
    this.setMeta('backend', 'sqlite-vec');
    this.setMeta('schema_version', '1');
  }

  tryLoadSqliteVec() {
    if (!this.sqliteVecExtensionPath) return;
    try {
      if (typeof this.db.enableLoadExtension === 'function') {
        this.db.enableLoadExtension(true);
      }
      if (typeof this.db.loadExtension === 'function') {
        this.db.loadExtension(this.sqliteVecExtensionPath);
        this.sqliteVecLoaded = true;
      }
    } catch {
      this.sqliteVecLoaded = false;
    }
  }

  setMeta(key, value) {
    (this._stmtSetMeta || this.db.prepare('INSERT OR REPLACE INTO index_meta(key, value) VALUES (?, ?)')).run(key, String(value));
  }

  getMeta(key) {
    const row = (this._stmtGetMeta || this.db.prepare('SELECT value FROM index_meta WHERE key = ?')).get(key);
    return row ? row.value : null;
  }

  getStatus() {
    this.ensureDb();
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM files').get();
    const chunkRow = this.db.prepare('SELECT COUNT(*) AS c FROM chunks').get();
    return {
      backend: 'sqlite-vec',
      db_path: this.dbPath,
      sqlite_vec_loaded: this.sqliteVecLoaded,
      updated_at: this.getMeta('updated_at'),
      total_files: row?.c || 0,
      total_chunks: chunkRow?.c || 0
    };
  }

  indexProject({ projectPath, allRoots, force, maxFiles }) {
    this.ensureDb();
    const bases = this.workspace.resolveSearchBases(projectPath, allRoots).map((p) => this.workspace.normalizeTarget(p));
    const files = this.collectFiles(bases, maxFiles);
    const fileSet = new Set(files);

    let processed = 0;
    let skipped = 0;
    let removed = 0;

    const stmtSelectSig = this.db.prepare('SELECT signature FROM files WHERE path = ?');
    const stmtSelectChunkTermsByFile = this.db.prepare('SELECT id, terms_json FROM chunks WHERE file_path = ?');
    const stmtDeleteChunks = this.db.prepare('DELETE FROM chunks WHERE file_path = ?');
    const stmtDeleteFile = this.db.prepare('DELETE FROM files WHERE path = ?');
    const stmtUpsertFile = this.db.prepare('INSERT OR REPLACE INTO files(path, signature, updated_at) VALUES (?, ?, ?)');
    const stmtInsertChunk = this.db.prepare(
      'INSERT OR REPLACE INTO chunks(id, file_path, start_line, end_line, preview, terms_json, norm) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const existingRows = this.db.prepare('SELECT path FROM files').all();
    const beforeChunkCount = this.db.prepare('SELECT COUNT(*) AS c FROM chunks').get()?.c || 0;
    const deltaDf = new Map();
    let deltaTotalChunks = 0;

    this.runInTransaction(() => {
      for (const row of existingRows) {
        if (!isUnderBase(row.path, bases)) continue;
        if (!fileSet.has(row.path)) {
          const oldRows = stmtSelectChunkTermsByFile.all(row.path);
          for (const oldRow of oldRows) {
            this.applyDfDeltaFromTermsJson(oldRow.terms_json, -1, deltaDf);
          }
          deltaTotalChunks -= oldRows.length;
          stmtDeleteChunks.run(row.path);
          stmtDeleteFile.run(row.path);
          removed += 1;
        }
      }

      for (const filePath of files) {
        const st = fs.statSync(filePath);
        const signature = makeFileSignature(st);
        const existing = stmtSelectSig.get(filePath);

        if (!force && existing && existing.signature === signature) {
          skipped += 1;
          continue;
        }

        const text = this.workspace.safeReadText(filePath);
        const chunks = this.chunkFile(filePath, text);
        const existingChunkRows = existing ? stmtSelectChunkTermsByFile.all(filePath) : [];

        if (existingChunkRows.length > 0) {
          for (const oldRow of existingChunkRows) {
            this.applyDfDeltaFromTermsJson(oldRow.terms_json, -1, deltaDf);
          }
          deltaTotalChunks -= existingChunkRows.length;
        }

        stmtDeleteChunks.run(filePath);
        stmtUpsertFile.run(filePath, signature, new Date().toISOString());

        for (const chunk of chunks) {
          this.applyDfDeltaFromTerms(chunk.terms, 1, deltaDf);
          stmtInsertChunk.run(
            chunk.id,
            filePath,
            chunk.start_line,
            chunk.end_line,
            chunk.preview,
            JSON.stringify(chunk.terms),
            chunk.norm
          );
        }
        deltaTotalChunks += chunks.length;
        processed += 1;
      }
    });

    this.applyDfDeltas(deltaDf);
    const changedTerms = new Set(
      Array.from(deltaDf.entries())
        .filter(([, delta]) => delta !== 0)
        .map(([term]) => term)
    );
    this.refreshChunkNorms({
      changedTerms,
      totalChunksChanged: deltaTotalChunks !== 0,
      totalChunks: beforeChunkCount + deltaTotalChunks
    });
    this.setMeta('updated_at', new Date().toISOString());

    const status = this.getStatus();
    return {
      backend: 'sqlite-vec',
      bases,
      scanned_files: files.length,
      indexed_files: processed,
      skipped_files: skipped,
      removed_files: removed,
      total_files: status.total_files,
      total_chunks: status.total_chunks,
      db_path: this.dbPath,
      sqlite_vec_loaded: this.sqliteVecLoaded
    };
  }

  semanticSearch({ query, projectPath, allRoots, maxResults, minScore }) {
    this.ensureDb();
    if (!query || !query.trim()) return [];

    const bases = this.workspace.resolveSearchBases(projectPath, allRoots).map((p) => this.workspace.normalizeTarget(p));
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const queryTfPairs = toSparsePairs(queryTokens, this.maxTermsPerChunk);
    const totalChunks = this.db.prepare('SELECT COUNT(*) AS c FROM chunks').get()?.c || 0;
    if (totalChunks === 0) return [];

    const dfMap = this.batchGetDf(queryTfPairs.map(([t]) => t));
    const queryNorm = this.computeNorm(queryTfPairs, totalChunks, dfMap);
    if (queryNorm === 0) return [];

    const baseScope = buildBaseScopeClause(bases);
    const termCandidates = queryTfPairs.map(([term]) => term).slice(0, 8);
    const termClauses = termCandidates.map(() => 'terms_json LIKE ? ESCAPE \'\\\'');
    const termParams = termCandidates.map((term) => `%\"${escapeLike(term)}\"%`);
    const rows = this.db.prepare(
      `SELECT file_path, start_line, end_line, preview, terms_json, norm
       FROM chunks
       WHERE (${baseScope.where}) AND (${termClauses.join(' OR ')})`
    ).all(...baseScope.params, ...termParams);

    const out = [];
    for (const row of rows) {
      const terms = JSON.parse(row.terms_json);
      const score = this.computeCosine(queryTfPairs, queryNorm, terms, row.norm, totalChunks, dfMap);
      if (score < minScore) continue;
      out.push({
        file: row.file_path,
        start_line: row.start_line,
        end_line: row.end_line,
        snippet: row.preview,
        semantic_score: score
      });
    }

    out.sort((a, b) => b.semantic_score - a.semantic_score);
    return out.slice(0, maxResults);
  }

  batchGetDf(terms) {
    if (terms.length === 0) return new Map();
    const placeholders = terms.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT term, df FROM term_df WHERE term IN (${placeholders})`).all(...terms);
    return new Map(rows.map((r) => [r.term, r.df]));
  }

  collectFiles(bases, maxFiles) {
    const files = [];
    for (const base of bases) {
      for (const { files: batch } of this.workspace.walkDirectories(base)) {
        for (const filePath of batch) {
          if (!this.workspace.isLikelyTextFile(filePath)) continue;
          files.push(filePath);
          if (files.length >= Math.min(maxFiles, this.maxIndexedFiles)) {
            return files;
          }
        }
      }
    }
    return files;
  }

  chunkFile(filePath, text) {
    const lines = text.split(/\r?\n/);
    const chunks = [];
    const step = Math.max(1, this.chunkLines - this.chunkOverlap);

    for (let start = 1; start <= lines.length; start += step) {
      const end = Math.min(lines.length, start + this.chunkLines - 1);
      const chunkText = lines.slice(start - 1, end).join('\n');
      const tokens = tokenize(chunkText);
      if (tokens.length === 0) continue;
      const terms = toSparsePairs(tokens, this.maxTermsPerChunk);
      chunks.push({
        id: `${filePath}:${start}-${end}`,
        start_line: start,
        end_line: end,
        preview: chunkText.slice(0, 500),
        terms,
        norm: 0
      });
    }
    return chunks;
  }

  rebuildDf() {
    const rows = this.db.prepare('SELECT id, terms_json FROM chunks').all();
    const df = new Map();

    for (const row of rows) {
      const terms = JSON.parse(row.terms_json);
      const seen = new Set();
      for (const [term] of terms) {
        if (seen.has(term)) continue;
        seen.add(term);
        df.set(term, (df.get(term) || 0) + 1);
      }
    }

    const totalChunks = rows.length;

    this.runInTransaction(() => {
      this.db.prepare('DELETE FROM term_df').run();
      const insertDf = this.db.prepare('INSERT INTO term_df(term, df) VALUES (?, ?)');
      for (const [term, count] of df.entries()) {
        insertDf.run(term, count);
      }

      const updateNorm = this.db.prepare('UPDATE chunks SET norm = ? WHERE id = ?');
      for (const chunk of rows) {
        const terms = JSON.parse(chunk.terms_json);
        const norm = this.computeNorm(terms, totalChunks, df);
        updateNorm.run(norm, chunk.id);
      }
    });
  }

  applyDfDeltaFromTerms(terms, delta, intoMap) {
    const seen = new Set();
    for (const [term] of terms || []) {
      if (seen.has(term)) continue;
      seen.add(term);
      intoMap.set(term, (intoMap.get(term) || 0) + delta);
    }
  }

  applyDfDeltaFromTermsJson(termsJson, delta, intoMap) {
    const parsed = JSON.parse(termsJson);
    this.applyDfDeltaFromTerms(parsed, delta, intoMap);
  }

  applyDfDeltas(deltaDf) {
    if (deltaDf.size === 0) return;
    const stmtUpsert = this.db.prepare('INSERT OR REPLACE INTO term_df(term, df) VALUES (?, ?)');
    const stmtDelete = this.db.prepare('DELETE FROM term_df WHERE term = ?');

    this.runInTransaction(() => {
      for (const [term, delta] of deltaDf.entries()) {
        if (!delta) continue;
        const next = this.getDf(term) + delta;
        if (next <= 0) {
          stmtDelete.run(term);
        } else {
          stmtUpsert.run(term, next);
        }
      }
    });
  }

  refreshChunkNorms({ changedTerms, totalChunksChanged, totalChunks }) {
    const stmtUpdateNorm = this.db.prepare('UPDATE chunks SET norm = ? WHERE id = ?');

    let rows = [];
    if (totalChunksChanged) {
      rows = this.db.prepare('SELECT id, terms_json FROM chunks').all();
    } else if (changedTerms.size > 0) {
      const stmtByTerm = this.db.prepare('SELECT id, terms_json FROM chunks WHERE terms_json LIKE ? ESCAPE \'\\\'');
      const byId = new Map();
      for (const term of changedTerms) {
        const pattern = `%\"${escapeLike(term)}\"%`;
        for (const row of stmtByTerm.all(pattern)) {
          if (!byId.has(row.id)) byId.set(row.id, row);
        }
      }
      rows = Array.from(byId.values());
    } else {
      return;
    }

    this.runInTransaction(() => {
      for (const row of rows) {
        const terms = JSON.parse(row.terms_json);
        const norm = this.computeNorm(terms, totalChunks);
        stmtUpdateNorm.run(norm, row.id);
      }
    });
  }

  runInTransaction(work) {
    this.db.exec('BEGIN');
    try {
      work();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getDf(term) {
    const row = (this._stmtGetDf || this.db.prepare('SELECT df FROM term_df WHERE term = ?')).get(term);
    return row ? row.df : 0;
  }

  computeNorm(tfPairs, totalChunks, dfMap) {
    let sum = 0;
    const n = Math.max(1, totalChunks);
    for (const [term, tf] of tfPairs) {
      const df = dfMap ? (dfMap.get(term) || 0) : this.getDf(term);
      const idf = Math.log((n + 1) / (df + 1)) + 1;
      const w = tf * idf;
      sum += w * w;
    }
    return Math.sqrt(sum);
  }

  computeCosine(queryTfPairs, queryNorm, chunkTfPairs, chunkNorm, totalChunks, dfMap) {
    if (!queryNorm || !chunkNorm) return 0;
    const n = Math.max(1, totalChunks);
    const chunkMap = new Map(chunkTfPairs);
    let dot = 0;
    for (const [term, qtf] of queryTfPairs) {
      const ctf = chunkMap.get(term);
      if (!ctf) continue;
      const df = dfMap ? (dfMap.get(term) || 0) : this.getDf(term);
      const idf = Math.log((n + 1) / (df + 1)) + 1;
      dot += (qtf * idf) * (ctf * idf);
    }
    return dot / (queryNorm * chunkNorm);
  }
}
