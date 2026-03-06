import { scorePathAffinity } from './query-utils.js';

function buildFusedBase({ lexical, semantic }) {
  const k = 60;
  const scored = new Map();
  const lexicalLineKey = new Map();

  lexical.forEach((item, idx) => {
    const key = `${item.file}:${item.line}:${item.line}`;
    scored.set(key, {
      type: 'lexical',
      file: item.file,
      line: item.line,
      start_line: item.line,
      end_line: item.line,
      text: item.text,
      lexical_rank: idx + 1,
      lexical_score: 1 / (k + idx + 1),
      semantic_rank: null,
      semantic_score: 0,
      semantic_score_raw: null
    });
    lexicalLineKey.set(`${item.file}:${item.line}`, key);
  });

  semantic.forEach((item, idx) => {
    let mergedKey = null;
    for (let line = item.start_line; line <= item.end_line; line += 1) {
      const byLine = lexicalLineKey.get(`${item.file}:${line}`);
      if (byLine) {
        mergedKey = byLine;
        break;
      }
    }
    const key = mergedKey || `${item.file}:${item.start_line}:${item.end_line}`;
    const existing = scored.get(key);
    if (existing) {
      existing.type = 'hybrid';
      existing.start_line = Math.min(existing.start_line || item.start_line, item.start_line);
      existing.end_line = Math.max(existing.end_line || item.end_line, item.end_line);
      if (!existing.snippet) existing.snippet = item.snippet;
      existing.semantic_rank = idx + 1;
      existing.semantic_score = 1 / (k + idx + 1);
      existing.semantic_score_raw = item.semantic_score;
      return;
    }

    scored.set(key, {
      type: 'semantic',
      file: item.file,
      start_line: item.start_line,
      end_line: item.end_line,
      snippet: item.snippet,
      lexical_rank: null,
      lexical_score: 0,
      semantic_rank: idx + 1,
      semantic_score: 1 / (k + idx + 1),
      semantic_score_raw: item.semantic_score
    });
  });

  return Array.from(scored.values());
}

function applyRrfAdjustments({ rows, queryTerms, allRoots, genericShortQuery }) {
  return rows
    .map((item) => ({
      ...item,
      path_affinity: scorePathAffinity(item.file, queryTerms)
    }))
    .map((item) => {
      let rrfScore = item.lexical_score + item.semantic_score;

      if (allRoots) {
        rrfScore += item.path_affinity * 0.03;
      }

      if (genericShortQuery && item.type === 'lexical' && item.semantic_score === 0) {
        rrfScore *= 0.35;
      }

      if (genericShortQuery && item.type === 'hybrid') {
        rrfScore += 0.004;
      }

      return {
        ...item,
        rrf_score: rrfScore,
        final_score: rrfScore,
        reranker_score: null
      };
    })
    .sort((a, b) => b.rrf_score - a.rrf_score);
}

async function maybeApplyReranker({
  fused,
  query,
  useReranker,
  reranker,
  rerankerMinCandidates,
  rerankerTopN
}) {
  let rerankerMeta = {
    requested: !!useReranker,
    applied: false,
    reason: 'not-requested'
  };

  if (useReranker && reranker?.isEnabled?.()) {
    if (fused.length < rerankerMinCandidates) {
      rerankerMeta = {
        requested: true,
        applied: false,
        reason: 'not-enough-candidates',
        min_candidates: rerankerMinCandidates,
        candidate_count: fused.length
      };
      return { fused, rerankerMeta };
    }

    const rerankWindow = fused.slice(0, Math.min(fused.length, rerankerTopN));
    const rerankScores = await reranker.rerank(query, rerankWindow);
    if (rerankScores.length === rerankWindow.length) {
      for (let i = 0; i < rerankWindow.length; i += 1) {
        const score = rerankScores[i];
        rerankWindow[i].reranker_score = score;
        rerankWindow[i].final_score = rerankWindow[i].rrf_score * 0.7 + score * 0.3;
      }
      fused = [...rerankWindow, ...fused.slice(rerankWindow.length)]
        .sort((a, b) => b.final_score - a.final_score);
      rerankerMeta = {
        requested: true,
        applied: true,
        reason: 'ok',
        reranked: rerankWindow.length
      };
      return { fused, rerankerMeta };
    }

    rerankerMeta = {
      requested: true,
      applied: false,
      reason: 'reranker-unavailable'
    };
    return { fused, rerankerMeta };
  }

  if (useReranker) {
    rerankerMeta = {
      requested: true,
      applied: false,
      reason: 'reranker-disabled'
    };
  }
  return { fused, rerankerMeta };
}

function computeRankingMode({ lexicalHits, semanticHits }) {
  if (lexicalHits > 0 && semanticHits > 0) return 'hybrid';
  if (lexicalHits > 0) return 'lexical-only';
  if (semanticHits > 0) return 'semantic-only';
  return 'none';
}

export async function fuseRankAndRerank({
  query,
  lexical,
  semantic,
  queryTerms,
  allRoots,
  genericShortQuery,
  useReranker,
  reranker,
  rerankerMinCandidates,
  rerankerTopN,
  maxResults
}) {
  const base = buildFusedBase({ lexical, semantic });
  let fused = applyRrfAdjustments({
    rows: base,
    queryTerms,
    allRoots,
    genericShortQuery
  });

  const reranked = await maybeApplyReranker({
    fused,
    query,
    useReranker,
    reranker,
    rerankerMinCandidates,
    rerankerTopN
  });
  fused = reranked.fused.slice(0, maxResults);

  return {
    results: fused,
    reranker: reranked.rerankerMeta,
    rankingMode: computeRankingMode({
      lexicalHits: lexical.length,
      semanticHits: semantic.length
    })
  };
}

