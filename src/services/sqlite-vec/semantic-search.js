import { tokenize, toSparsePairs } from '../core/tokenizer.js';
import { bm25Score, cosineSimilarity, cosineToUnitScore, normalizeBm25 } from '../core/relevance.js';
import { buildBaseScopeClause, scoreFromVecDistance } from './helpers.js';

export async function semanticSearch(db, embeddingService, workspace, state, { query, projectPath, allRoots, maxResults, minScore }) {
  if (!query || !query.trim()) return [];

  const { sqliteVecTableReady, maxTermsPerChunk, bm25K1, bm25B, onVecError } = state;
  const bases = workspace.resolveSearchBases(projectPath, allRoots).map((p) => workspace.normalizeTarget(p));
  const queryTokens = tokenize(query);
  const queryTfPairs = toSparsePairs(queryTokens, maxTermsPerChunk);

  let queryEmbedding = null;
  if (embeddingService?.isEnabled?.()) {
    try {
      queryEmbedding = await embeddingService.embed(query);
    } catch {
      queryEmbedding = null;
    }
  }

  if (queryTfPairs.length === 0 && !queryEmbedding) return [];

  const totalChunks = db.prepare('SELECT COUNT(*) AS c FROM chunks').get()?.c || 0;
  if (totalChunks === 0) return [];

  const avgChunkTerms = db.prepare('SELECT AVG(term_count) AS v FROM chunks').get()?.v || 0;
  const dfMap = queryTfPairs.length > 0
    ? new Map(
      db.prepare(`SELECT term, df FROM term_df WHERE term IN (${queryTfPairs.map(() => '?').join(',')})`).all(...queryTfPairs.map(([t]) => t)).map((r) => [r.term, r.df])
    )
    : new Map();

  const baseScope = buildBaseScopeClause(bases);

  let vecRows = null;
  if (queryEmbedding && sqliteVecTableReady) {
    try {
      const k = Math.max(maxResults * 6, 64);
      vecRows = db.prepare(
        `SELECT c.file_path, c.start_line, c.end_line, c.preview, v.distance
         FROM vec_chunks v
         JOIN chunks c ON c.rowid = v.rowid
         WHERE v.embedding MATCH ? AND k = ${k}
           AND (${baseScope.where})
         ORDER BY v.distance ASC
         LIMIT ${k}`
      ).all(JSON.stringify(queryEmbedding), ...baseScope.params);
    } catch (error) {
      if (typeof onVecError === 'function') onVecError(String(error?.message || error || ''));
      vecRows = null;
    }
  }

  const rows = Array.isArray(vecRows)
    ? vecRows
    : (queryEmbedding
      ? db.prepare(
        `SELECT c.file_path, c.start_line, c.end_line, c.preview, c.terms_json, c.term_count, c.embedding_json
         FROM chunks c
         WHERE ${baseScope.where}`
      ).all(...baseScope.params)
      : (() => {
        if (queryTfPairs.length === 0) return [];
        const termCandidates = queryTfPairs.map(([term]) => term).slice(0, 8);
        const termPlaceholders = termCandidates.map(() => '?').join(',');
        return db.prepare(
          `SELECT DISTINCT c.file_path, c.start_line, c.end_line, c.preview, c.terms_json, c.term_count, c.embedding_json
           FROM term_index ti
           JOIN chunks c ON c.id = ti.chunk_id
           WHERE ti.term IN (${termPlaceholders})
             AND (${baseScope.where})`
        ).all(...termCandidates, ...baseScope.params);
      })());

  const out = [];
  for (const row of rows) {
    let score;
    if (Array.isArray(vecRows)) {
      score = scoreFromVecDistance(row.distance);
    } else {
      const terms = JSON.parse(row.terms_json || '[]');
      const termLookup = new Map(terms);
      const bm25Raw = bm25Score(
        queryTfPairs, termLookup, row.term_count || 0, avgChunkTerms, totalChunks, dfMap,
        { k1: bm25K1, b: bm25B }
      );
      const bm25Norm = normalizeBm25(bm25Raw);
      score = bm25Norm;
      if (queryEmbedding && row.embedding_json) {
        try {
          const embedding = JSON.parse(row.embedding_json);
          score = cosineToUnitScore(cosineSimilarity(queryEmbedding, embedding));
        } catch {
          score = bm25Norm;
        }
      }
    }
    if (score < minScore) continue;
    out.push({ file: row.file_path, start_line: row.start_line, end_line: row.end_line, snippet: row.preview, semantic_score: score });
  }

  out.sort((a, b) => b.semantic_score - a.semantic_score);
  return out.slice(0, maxResults);
}
