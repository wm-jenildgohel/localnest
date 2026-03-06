import {
  nowIso,
  clampInt,
  splitTerms,
  scoreTokenOverlap,
  textContainsAllTerms,
  normalizeRecallScore,
  scoreScopeMatch,
  deserializeEntry
} from './utils.js';

export async function recall(adapter, {
  query,
  projectPath,
  topic,
  feature,
  branchName,
  rootPath,
  kind,
  limit = 10
}) {
  const safeLimit = clampInt(limit, 10, 1, 50);
  const filters = ['status = ?'];
  const params = ['active'];

  if (projectPath) {
    filters.push('(scope_project_path = ? OR scope_project_path = \'\')');
    params.push(projectPath);
  }
  if (topic) {
    filters.push('(topic = ? OR topic = \'\')');
    params.push(topic);
  }
  if (kind) {
    filters.push('kind = ?');
    params.push(kind);
  }

  const rows = await adapter.all(
    `SELECT *
       FROM memory_entries
      WHERE ${filters.join(' AND ')}
      ORDER BY importance DESC, updated_at DESC
      LIMIT 500`,
    params
  );

  const terms = splitTerms(query);
  const ranked = rows
    .map((row) => {
      const searchTerms = JSON.parse(row.search_terms_json || '[]');
      const haystack = [
        row.title,
        row.summary,
        row.content,
        row.topic,
        row.feature,
        row.tags_json
      ].join('\n').toLowerCase();

      let score = row.importance / 100;
      score += scoreTokenOverlap(terms, searchTerms) * 6;
      for (const term of terms) {
        if (row.title.toLowerCase().includes(term)) score += 5;
        if (row.summary.toLowerCase().includes(term)) score += 3;
        if (row.content.toLowerCase().includes(term)) score += 1.5;
        if (haystack.includes(term)) score += 1;
      }
      if (terms.length > 1 && textContainsAllTerms(`${row.title} ${row.summary}`, terms)) score += 3;
      score += scoreScopeMatch(row, {
        root_path: rootPath,
        project_path: projectPath,
        branch_name: branchName,
        topic,
        feature
      });
      if (row.last_recalled_at) score += Math.min(row.recall_count || 0, 5) * 0.1;
      if (row.kind === 'preference') score += 0.25;

      return {
        score,
        entry: deserializeEntry(row)
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, safeLimit);

  const recalledAt = nowIso();
  for (const item of ranked) {
    await adapter.run(
      `UPDATE memory_entries
          SET last_recalled_at = ?, recall_count = recall_count + 1
        WHERE id = ?`,
      [recalledAt, item.entry.id]
    );
    item.entry.last_recalled_at = recalledAt;
    item.entry.recall_count += 1;
  }

  return {
    query,
    count: ranked.length,
    items: ranked.map((item) => ({
      score: Number(normalizeRecallScore(item.score).toFixed(3)),
      raw_score: Number(item.score.toFixed(3)),
      memory: item.entry
    }))
  };
}
