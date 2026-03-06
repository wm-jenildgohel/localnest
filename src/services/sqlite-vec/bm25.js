import { escapeLike } from './helpers.js';

export const NORM_FULL_SCAN_THRESHOLD = 500;

export function applyDfDeltaFromTerms(terms, delta, intoMap) {
  const seen = new Set();
  for (const [term] of terms || []) {
    if (seen.has(term)) continue;
    seen.add(term);
    intoMap.set(term, (intoMap.get(term) || 0) + delta);
  }
}

export function applyDfDeltaFromTermsJson(termsJson, delta, intoMap) {
  applyDfDeltaFromTerms(JSON.parse(termsJson), delta, intoMap);
}

export function computeNorm(tfPairs, totalChunks, getDfFn) {
  let sum = 0;
  const n = Math.max(1, totalChunks);
  for (const [term, tf] of tfPairs) {
    const df = getDfFn ? getDfFn(term) : 0;
    const idf = Math.log((n + 1) / (df + 1)) + 1;
    const w = tf * idf;
    sum += w * w;
  }
  return Math.sqrt(sum);
}

export function computeCosine(queryTfPairs, queryNorm, chunkTfPairs, chunkNorm, totalChunks, getDfFn) {
  if (!queryNorm || !chunkNorm) return 0;
  const n = Math.max(1, totalChunks);
  const chunkMap = new Map(chunkTfPairs);
  let dot = 0;
  for (const [term, qtf] of queryTfPairs) {
    const ctf = chunkMap.get(term);
    if (!ctf) continue;
    const df = getDfFn ? getDfFn(term) : 0;
    const idf = Math.log((n + 1) / (df + 1)) + 1;
    dot += (qtf * idf) * (ctf * idf);
  }
  return dot / (queryNorm * chunkNorm);
}

export function applyDfDeltas(db, runInTransactionFn, deltaDf, getDfFn) {
  if (deltaDf.size === 0) return;
  const stmtUpsert = db.prepare('INSERT OR REPLACE INTO term_df(term, df) VALUES (?, ?)');
  const stmtDelete = db.prepare('DELETE FROM term_df WHERE term = ?');

  runInTransactionFn(() => {
    for (const [term, delta] of deltaDf.entries()) {
      if (!delta) continue;
      const next = getDfFn(term) + delta;
      if (next <= 0) {
        stmtDelete.run(term);
      } else {
        stmtUpsert.run(term, next);
      }
    }
  });
}

export function refreshChunkNorms(db, runInTransactionFn, { changedTerms, totalChunksChanged, totalChunks }, computeNormFn) {
  const stmtUpdateNorm = db.prepare('UPDATE chunks SET norm = ? WHERE id = ?');
  let rows = [];

  if (totalChunksChanged && changedTerms.size > NORM_FULL_SCAN_THRESHOLD) {
    rows = db.prepare('SELECT id, terms_json FROM chunks').all();
  } else if (changedTerms.size > 0) {
    const stmtByTerm = db.prepare("SELECT id, terms_json FROM chunks WHERE terms_json LIKE ? ESCAPE '\\'");
    const byId = new Map();
    for (const term of changedTerms) {
      const pattern = `%"${escapeLike(term)}"%`;
      for (const row of stmtByTerm.all(pattern)) {
        if (!byId.has(row.id)) byId.set(row.id, row);
      }
    }
    rows = Array.from(byId.values());
  } else {
    return;
  }

  runInTransactionFn(() => {
    for (const row of rows) {
      const terms = JSON.parse(row.terms_json);
      const norm = computeNormFn(terms, totalChunks);
      stmtUpdateNorm.run(norm, row.id);
    }
  });
}

export function rebuildDf(db, runInTransactionFn, computeNormFn) {
  const rows = db.prepare('SELECT id, terms_json FROM chunks').all();
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
  runInTransactionFn(() => {
    db.prepare('DELETE FROM term_df').run();
    const insertDf = db.prepare('INSERT INTO term_df(term, df) VALUES (?, ?)');
    for (const [term, count] of df.entries()) {
      insertDf.run(term, count);
    }
    const updateNorm = db.prepare('UPDATE chunks SET norm = ? WHERE id = ?');
    for (const chunk of rows) {
      const terms = JSON.parse(chunk.terms_json);
      const norm = computeNormFn(terms, totalChunks, (term) => df.get(term) || 0);
      updateNorm.run(norm, chunk.id);
    }
  });
}
