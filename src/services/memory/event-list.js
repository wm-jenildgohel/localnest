import { clampInt } from './utils.js';

export async function listEvents(adapter, { limit = 20, offset = 0, projectPath } = {}) {
  const filters = [];
  const params = [];
  if (projectPath) {
    filters.push('scope_project_path = ?');
    params.push(projectPath);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const countRow = await adapter.get(`SELECT COUNT(*) AS c FROM memory_events ${where}`, params);
  const safeLimit = clampInt(limit, 20, 1, 200);
  const safeOffset = clampInt(offset, 0, 0, 100000);
  const rows = await adapter.all(
    `SELECT id, event_type, title, summary, status, signal_score, promoted_memory_id,
            scope_project_path, topic, feature, tags_json, source_ref, created_at
       FROM memory_events
       ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );
  return {
    total_count: countRow?.c || 0,
    count: rows.length,
    limit: safeLimit,
    offset: safeOffset,
    has_more: safeOffset + rows.length < (countRow?.c || 0),
    next_offset: safeOffset + rows.length < (countRow?.c || 0) ? safeOffset + rows.length : null,
    items: rows.map((row) => ({
      id: row.id,
      event_type: row.event_type,
      title: row.title,
      summary: row.summary,
      status: row.status,
      signal_score: row.signal_score,
      promoted_memory_id: row.promoted_memory_id,
      scope_project_path: row.scope_project_path,
      topic: row.topic,
      feature: row.feature,
      tags: JSON.parse(row.tags_json || '[]'),
      source_ref: row.source_ref,
      created_at: row.created_at
    }))
  };
}
