import fs from 'node:fs';
import {
  nowIso, clampInt, cleanString, normalizeScope, deriveSummary, deriveTitle,
  ensureArray, normalizeLinks, stableJson, makeFingerprint, generateMemoryId,
  buildSearchTerms, deserializeEntry
} from './utils.js';

async function embedMemory(store, { title, summary, content }) {
  if (!store.embeddingService?.isEnabled?.()) return null;
  const text = [
    String(title || '').trim(),
    String(summary || '').trim(),
    String(content || '').slice(0, 500).trim()
  ].filter(Boolean).join('\n');
  if (!text) return null;
  try {
    return await store.embeddingService.embed(text);
  } catch {
    return null;
  }
}

export async function getStoreStatus(store) {
  const base = {
    enabled: store.enabled,
    db_path: store.dbPath,
    db_exists: fs.existsSync(store.dbPath),
    requested_backend: store.requestedBackend,
    selected_backend: store.selectedBackend
  };

  if (!store.enabled) {
    return { ...base, initialized: false };
  }

  await store.init();
  const entryRow = await store.adapter.get('SELECT COUNT(*) AS c FROM memory_entries');
  const revisionRow = await store.adapter.get('SELECT COUNT(*) AS c FROM memory_revisions');
  const eventRow = await store.adapter.get('SELECT COUNT(*) AS c FROM memory_events');
  const relationRow = await store.adapter.get('SELECT COUNT(*) AS c FROM memory_relations');
  return {
    ...base,
    initialized: true,
    schema_version: Number.parseInt(await store.getMeta('schema_version') || '0', 10) || 0,
    total_entries: entryRow?.c || 0,
    total_revisions: revisionRow?.c || 0,
    total_events: eventRow?.c || 0,
    total_relations: relationRow?.c || 0
  };
}

export async function listEntries(store, {
  kind,
  status,
  projectPath,
  topic,
  limit = 20,
  offset = 0
} = {}) {
  await store.init();
  const filters = [];
  const params = [];

  if (kind) { filters.push('kind = ?'); params.push(kind); }
  if (status) { filters.push('status = ?'); params.push(status); }
  if (projectPath) { filters.push('scope_project_path = ?'); params.push(projectPath); }
  if (topic) { filters.push('topic = ?'); params.push(topic); }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const countRow = await store.adapter.get(
    `SELECT COUNT(*) AS c FROM memory_entries ${where}`,
    params
  );

  const safeLimit = clampInt(limit, 20, 1, 200);
  const safeOffset = clampInt(offset, 0, 0, 100000);
  const rows = await store.adapter.all(
    `SELECT id, kind, title, summary, status, importance, confidence,
            scope_root_path, scope_project_path, scope_branch_name, topic, feature,
            tags_json, source_type, source_ref, created_at, updated_at, last_recalled_at, recall_count
       FROM memory_entries
       ${where}
      ORDER BY importance DESC, updated_at DESC
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
    items: rows.map((row) => deserializeEntry(row))
  };
}

export async function getEntry(store, id) {
  await store.init();
  const row = await store.adapter.get(
    'SELECT * FROM memory_entries WHERE id = ?',
    [id]
  );
  if (!row) return null;
  const revisions = await store.adapter.all(
    `SELECT revision, title, summary, content, tags_json, links_json, change_note, created_at
       FROM memory_revisions
      WHERE memory_id = ?
      ORDER BY revision DESC`,
    [id]
  );
  return {
    ...deserializeEntry(row),
    revisions: revisions.map((item) => ({
      revision: item.revision,
      title: item.title,
      summary: item.summary,
      content: item.content,
      tags: JSON.parse(item.tags_json || '[]'),
      links: JSON.parse(item.links_json || '[]'),
      change_note: item.change_note,
      created_at: item.created_at
    }))
  };
}

export async function storeEntry(store, input) {
  await store.init();
  const scope = normalizeScope(input.scope);
  const kind = cleanString(input.kind || 'knowledge', 40) || 'knowledge';
  const content = cleanString(input.content, 20000);
  const summary = deriveSummary(input.summary, content);
  const title = deriveTitle({
    title: input.title,
    summary,
    content,
    eventType: input.event_type || input.kind,
    scope
  });
  const status = cleanString(input.status || 'active', 30) || 'active';
  const tags = ensureArray(input.tags);
  const links = normalizeLinks(input.links);
  const sourceType = cleanString(input.source_type || input.sourceType || 'manual', 60) || 'manual';
  const sourceRef = cleanString(input.source_ref || input.sourceRef, 1000);
  const importance = clampInt(input.importance, 50, 0, 100);
  const confidenceRaw = Number(input.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0.7;

  if (!title) throw new Error('title is required');
  if (!content) throw new Error('content is required');

  const fingerprint = makeFingerprint({ kind, title, summary, content, scope, tags });
  const searchTerms = buildSearchTerms({ title, summary, content, scope, tags, links, sourceRef });
  const existing = await store.adapter.get(
    `SELECT id FROM memory_entries WHERE fingerprint = ? AND scope_project_path = ? LIMIT 1`,
    [fingerprint, scope.project_path]
  );

  if (existing) {
    return { created: false, duplicate: true, memory: await getEntry(store, existing.id) };
  }

  const id = generateMemoryId();
  const createdAt = nowIso();

  await store.adapter.exec('BEGIN');
  try {
    await store.adapter.run(
      `INSERT INTO memory_entries(
        id, kind, title, summary, content, status, importance, confidence,
        scope_root_path, scope_project_path, scope_branch_name, topic, feature,
        tags_json, search_terms_json, links_json, source_type, source_ref, fingerprint,
        created_at, updated_at, last_recalled_at, recall_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
      [
        id, kind, title, summary, content, status, importance, confidence,
        scope.root_path, scope.project_path, scope.branch_name, scope.topic, scope.feature,
        stableJson(tags), stableJson(searchTerms), stableJson(links),
        sourceType, sourceRef, fingerprint, createdAt, createdAt
      ]
    );
    await store.adapter.run(
      `INSERT INTO memory_revisions(
        memory_id, revision, title, summary, content, tags_json, links_json, change_note, created_at
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, title, summary, content, stableJson(tags), stableJson(links),
        cleanString(input.change_note || 'Initial memory creation', 400), createdAt
      ]
    );
    await store.adapter.exec('COMMIT');
  } catch (error) {
    await store.adapter.exec('ROLLBACK');
    throw error;
  }

  const embedding = await embedMemory(store, { title, summary, content });
  if (embedding) {
    await store.adapter.run(
      'UPDATE memory_entries SET embedding_json = ? WHERE id = ?',
      [JSON.stringify(embedding), id]
    );
  }

  return { created: true, duplicate: false, memory: await getEntry(store, id) };
}

export async function updateEntry(store, id, patch = {}) {
  await store.init();
  const existing = await getEntry(store, id);
  if (!existing) throw new Error(`memory not found: ${id}`);

  const scope = normalizeScope({
    root_path: patch.scope?.root_path ?? existing.scope_root_path,
    project_path: patch.scope?.project_path ?? existing.scope_project_path,
    branch_name: patch.scope?.branch_name ?? existing.scope_branch_name,
    topic: patch.scope?.topic ?? existing.topic,
    feature: patch.scope?.feature ?? existing.feature
  });

  const next = {
    kind: cleanString(patch.kind, 40) || existing.kind,
    title: cleanString(patch.title, 400) || existing.title,
    summary: patch.summary === undefined ? existing.summary : cleanString(patch.summary, 4000),
    content: patch.content === undefined ? existing.content : cleanString(patch.content, 20000),
    status: cleanString(patch.status, 30) || existing.status,
    importance: patch.importance === undefined ? existing.importance : clampInt(patch.importance, existing.importance, 0, 100),
    confidence: patch.confidence === undefined
      ? existing.confidence
      : Math.max(0, Math.min(1, Number(patch.confidence) || existing.confidence)),
    tags: patch.tags === undefined ? existing.tags : ensureArray(patch.tags),
    links: patch.links === undefined ? existing.links : normalizeLinks(patch.links),
    source_type: cleanString(patch.source_type, 60) || existing.source_type,
    source_ref: patch.source_ref === undefined ? existing.source_ref : cleanString(patch.source_ref, 1000)
  };

  const fingerprint = makeFingerprint({
    kind: next.kind, title: next.title, summary: next.summary,
    content: next.content, scope, tags: next.tags
  });
  const searchTerms = buildSearchTerms({
    title: next.title, summary: next.summary, content: next.content,
    scope, tags: next.tags, links: next.links, sourceRef: next.source_ref
  });
  const updatedAt = nowIso();
  const revision = (existing.revisions?.[0]?.revision || 0) + 1;

  await store.adapter.exec('BEGIN');
  try {
    await store.adapter.run(
      `UPDATE memory_entries
          SET kind = ?, title = ?, summary = ?, content = ?, status = ?,
              importance = ?, confidence = ?,
              scope_root_path = ?, scope_project_path = ?, scope_branch_name = ?, topic = ?, feature = ?,
              tags_json = ?, search_terms_json = ?, links_json = ?, source_type = ?, source_ref = ?, fingerprint = ?, updated_at = ?
        WHERE id = ?`,
      [
        next.kind, next.title, next.summary, next.content, next.status,
        next.importance, next.confidence,
        scope.root_path, scope.project_path, scope.branch_name, scope.topic, scope.feature,
        stableJson(next.tags), stableJson(searchTerms), stableJson(next.links),
        next.source_type, next.source_ref, fingerprint, updatedAt, id
      ]
    );
    await store.adapter.run(
      `INSERT INTO memory_revisions(
        memory_id, revision, title, summary, content, tags_json, links_json, change_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, revision, next.title, next.summary, next.content,
        stableJson(next.tags), stableJson(next.links),
        cleanString(patch.change_note || 'Memory updated', 400), updatedAt
      ]
    );
    await store.adapter.exec('COMMIT');
  } catch (error) {
    await store.adapter.exec('ROLLBACK');
    throw error;
  }

  const embedding = await embedMemory(store, { title: next.title, summary: next.summary, content: next.content });
  if (embedding) {
    await store.adapter.run(
      'UPDATE memory_entries SET embedding_json = ? WHERE id = ?',
      [JSON.stringify(embedding), id]
    );
  }

  return getEntry(store, id);
}

export async function deleteEntry(store, id) {
  await store.init();
  const existing = await getEntry(store, id);
  if (!existing) return { deleted: false, id };

  await store.adapter.exec('BEGIN');
  try {
    await store.adapter.run('DELETE FROM memory_relations WHERE source_id = ? OR target_id = ?', [id, id]);
    await store.adapter.run('DELETE FROM memory_revisions WHERE memory_id = ?', [id]);
    await store.adapter.run('DELETE FROM memory_entries WHERE id = ?', [id]);
    await store.adapter.exec('COMMIT');
  } catch (error) {
    await store.adapter.exec('ROLLBACK');
    throw error;
  }

  return { deleted: true, id };
}
