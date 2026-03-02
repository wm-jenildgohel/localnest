import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function cleanString(value, maxLength = 0) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!maxLength || trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength).trim();
}

function ensureArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 50);
}

function stableJson(value) {
  return JSON.stringify(value || []);
}

function normalizeScope(scope = {}) {
  return {
    root_path: cleanString(scope.root_path || scope.rootPath),
    project_path: cleanString(scope.project_path || scope.projectPath),
    branch_name: cleanString(scope.branch_name || scope.branchName, 200),
    topic: cleanString(scope.topic, 200),
    feature: cleanString(scope.feature, 200)
  };
}

function normalizeLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      path: cleanString(item.path, 4000),
      line: Number.isFinite(item.line) ? item.line : null,
      label: cleanString(item.label, 200)
    }))
    .filter((item) => item.path)
    .slice(0, 50);
}

function makeFingerprint({ kind, title, summary, content, scope, tags }) {
  const payload = [
    cleanString(kind, 40).toLowerCase(),
    cleanString(title, 400).toLowerCase(),
    cleanString(summary, 4000).toLowerCase(),
    cleanString(content, 20000).toLowerCase(),
    scope.project_path.toLowerCase(),
    scope.topic.toLowerCase(),
    scope.feature.toLowerCase(),
    ensureArray(tags).join('|').toLowerCase()
  ].join('\n');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

function generateMemoryId() {
  return `mem_${crypto.randomUUID().replace(/-/g, '')}`;
}

function splitTerms(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

class NodeSqliteAdapter {
  constructor(db) {
    this.db = db;
  }

  async exec(sql) {
    this.db.exec(sql);
  }

  async run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: result?.changes ?? 0,
      lastInsertRowid: result?.lastInsertRowid ?? null
    };
  }

  async get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) || null;
  }

  async all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) || [];
  }
}

export class MemoryStore {
  constructor({
    enabled,
    backend,
    dbPath
  }) {
    this.enabled = enabled;
    this.requestedBackend = backend || 'auto';
    this.dbPath = dbPath;
    this.adapter = null;
    this.selectedBackend = null;
  }

  async init() {
    if (!this.enabled) {
      return {
        enabled: false,
        initialized: false,
        requested_backend: this.requestedBackend,
        selected_backend: null
      };
    }

    if (this.adapter) {
      return {
        enabled: true,
        initialized: true,
        requested_backend: this.requestedBackend,
        selected_backend: this.selectedBackend
      };
    }

    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    const selected = await this.selectBackend();
    if (!selected) {
      throw new Error('No supported SQLite backend detected for memory store');
    }

    this.adapter = selected.adapter;
    this.selectedBackend = selected.name;
    await this.adapter.exec('PRAGMA journal_mode=WAL;');
    await this.adapter.exec('PRAGMA synchronous=NORMAL;');
    await this.ensureSchema();

    return {
      enabled: true,
      initialized: true,
      requested_backend: this.requestedBackend,
      selected_backend: this.selectedBackend
    };
  }

  async selectBackend() {
    if (this.requestedBackend === 'node-sqlite' || this.requestedBackend === 'auto') {
      try {
        const { DatabaseSync } = await import('node:sqlite');
        const db = new DatabaseSync(this.dbPath);
        return { name: 'node-sqlite', adapter: new NodeSqliteAdapter(db) };
      } catch {
        if (this.requestedBackend === 'node-sqlite') return null;
      }
    }

    return null;
  }

  async ensureSchema() {
    await this.adapter.exec(`
      CREATE TABLE IF NOT EXISTS memory_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 50,
        confidence REAL NOT NULL DEFAULT 0.7,
        scope_root_path TEXT NOT NULL DEFAULT '',
        scope_project_path TEXT NOT NULL DEFAULT '',
        scope_branch_name TEXT NOT NULL DEFAULT '',
        topic TEXT NOT NULL DEFAULT '',
        feature TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        links_json TEXT NOT NULL DEFAULT '[]',
        source_type TEXT NOT NULL DEFAULT 'manual',
        source_ref TEXT NOT NULL DEFAULT '',
        fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_recalled_at TEXT,
        recall_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS memory_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        links_json TEXT NOT NULL DEFAULT '[]',
        change_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (memory_id) REFERENCES memory_entries(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processed',
        signal_score REAL NOT NULL DEFAULT 0,
        promoted_memory_id TEXT,
        scope_root_path TEXT NOT NULL DEFAULT '',
        scope_project_path TEXT NOT NULL DEFAULT '',
        scope_branch_name TEXT NOT NULL DEFAULT '',
        topic TEXT NOT NULL DEFAULT '',
        feature TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        links_json TEXT NOT NULL DEFAULT '[]',
        source_ref TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_entries_project ON memory_entries(scope_project_path);
      CREATE INDEX IF NOT EXISTS idx_memory_entries_topic ON memory_entries(topic);
      CREATE INDEX IF NOT EXISTS idx_memory_entries_status ON memory_entries(status);
      CREATE INDEX IF NOT EXISTS idx_memory_entries_updated_at ON memory_entries(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_entries_fingerprint ON memory_entries(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_memory_revisions_memory_id ON memory_revisions(memory_id, revision DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_events_created_at ON memory_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_events_project ON memory_events(scope_project_path);
    `);

    await this.setMeta('schema_version', String(SCHEMA_VERSION));
  }

  async setMeta(key, value) {
    await this.adapter.run(
      'INSERT OR REPLACE INTO memory_meta(key, value) VALUES (?, ?)',
      [key, String(value)]
    );
  }

  async getMeta(key) {
    const row = await this.adapter.get(
      'SELECT value FROM memory_meta WHERE key = ?',
      [key]
    );
    return row ? row.value : null;
  }

  async getStatus() {
    const base = {
      enabled: this.enabled,
      db_path: this.dbPath,
      db_exists: fs.existsSync(this.dbPath),
      requested_backend: this.requestedBackend,
      selected_backend: this.selectedBackend
    };

    if (!this.enabled) {
      return {
        ...base,
        initialized: false
      };
    }

    await this.init();
    const entryRow = await this.adapter.get('SELECT COUNT(*) AS c FROM memory_entries');
    const revisionRow = await this.adapter.get('SELECT COUNT(*) AS c FROM memory_revisions');
    const eventRow = await this.adapter.get('SELECT COUNT(*) AS c FROM memory_events');
    return {
      ...base,
      initialized: true,
      schema_version: Number.parseInt(await this.getMeta('schema_version') || '0', 10) || 0,
      total_entries: entryRow?.c || 0,
      total_revisions: revisionRow?.c || 0,
      total_events: eventRow?.c || 0
    };
  }

  async listEntries({
    kind,
    status,
    projectPath,
    topic,
    limit = 20,
    offset = 0
  } = {}) {
    await this.init();
    const filters = [];
    const params = [];

    if (kind) {
      filters.push('kind = ?');
      params.push(kind);
    }
    if (status) {
      filters.push('status = ?');
      params.push(status);
    }
    if (projectPath) {
      filters.push('scope_project_path = ?');
      params.push(projectPath);
    }
    if (topic) {
      filters.push('topic = ?');
      params.push(topic);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const countRow = await this.adapter.get(
      `SELECT COUNT(*) AS c FROM memory_entries ${where}`,
      params
    );

    const safeLimit = clampInt(limit, 20, 1, 200);
    const safeOffset = clampInt(offset, 0, 0, 100000);
    const rows = await this.adapter.all(
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
      items: rows.map((row) => this.deserializeEntry(row))
    };
  }

  async getEntry(id) {
    await this.init();
    const row = await this.adapter.get(
      'SELECT * FROM memory_entries WHERE id = ?',
      [id]
    );
    if (!row) return null;
    const revisions = await this.adapter.all(
      `SELECT revision, title, summary, content, tags_json, links_json, change_note, created_at
         FROM memory_revisions
        WHERE memory_id = ?
        ORDER BY revision DESC`,
      [id]
    );
    return {
      ...this.deserializeEntry(row),
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

  async storeEntry(input) {
    await this.init();
    const scope = normalizeScope(input.scope);
    const kind = cleanString(input.kind || 'knowledge', 40) || 'knowledge';
    const title = cleanString(input.title, 400);
    const summary = cleanString(input.summary, 4000);
    const content = cleanString(input.content, 20000);
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
    const existing = await this.adapter.get(
      `SELECT id, title, summary, content
         FROM memory_entries
        WHERE fingerprint = ?
          AND scope_project_path = ?
        LIMIT 1`,
      [fingerprint, scope.project_path]
    );

    if (existing) {
      return {
        created: false,
        duplicate: true,
        memory: await this.getEntry(existing.id)
      };
    }

    const id = generateMemoryId();
    const createdAt = nowIso();

    await this.adapter.exec('BEGIN');
    try {
      await this.adapter.run(
        `INSERT INTO memory_entries(
          id, kind, title, summary, content, status, importance, confidence,
          scope_root_path, scope_project_path, scope_branch_name, topic, feature,
          tags_json, links_json, source_type, source_ref, fingerprint,
          created_at, updated_at, last_recalled_at, recall_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
        [
          id,
          kind,
          title,
          summary,
          content,
          status,
          importance,
          confidence,
          scope.root_path,
          scope.project_path,
          scope.branch_name,
          scope.topic,
          scope.feature,
          stableJson(tags),
          stableJson(links),
          sourceType,
          sourceRef,
          fingerprint,
          createdAt,
          createdAt
        ]
      );
      await this.adapter.run(
        `INSERT INTO memory_revisions(
          memory_id, revision, title, summary, content, tags_json, links_json, change_note, created_at
        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          title,
          summary,
          content,
          stableJson(tags),
          stableJson(links),
          cleanString(input.change_note || 'Initial memory creation', 400),
          createdAt
        ]
      );
      await this.adapter.exec('COMMIT');
    } catch (error) {
      await this.adapter.exec('ROLLBACK');
      throw error;
    }

    return {
      created: true,
      duplicate: false,
      memory: await this.getEntry(id)
    };
  }

  async updateEntry(id, patch = {}) {
    await this.init();
    const existing = await this.getEntry(id);
    if (!existing) {
      throw new Error(`memory not found: ${id}`);
    }

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
      kind: next.kind,
      title: next.title,
      summary: next.summary,
      content: next.content,
      scope,
      tags: next.tags
    });
    const updatedAt = nowIso();
    const revision = (existing.revisions?.[0]?.revision || 0) + 1;

    await this.adapter.exec('BEGIN');
    try {
      await this.adapter.run(
        `UPDATE memory_entries
            SET kind = ?, title = ?, summary = ?, content = ?, status = ?,
                importance = ?, confidence = ?,
                scope_root_path = ?, scope_project_path = ?, scope_branch_name = ?, topic = ?, feature = ?,
                tags_json = ?, links_json = ?, source_type = ?, source_ref = ?, fingerprint = ?, updated_at = ?
          WHERE id = ?`,
        [
          next.kind,
          next.title,
          next.summary,
          next.content,
          next.status,
          next.importance,
          next.confidence,
          scope.root_path,
          scope.project_path,
          scope.branch_name,
          scope.topic,
          scope.feature,
          stableJson(next.tags),
          stableJson(next.links),
          next.source_type,
          next.source_ref,
          fingerprint,
          updatedAt,
          id
        ]
      );
      await this.adapter.run(
        `INSERT INTO memory_revisions(
          memory_id, revision, title, summary, content, tags_json, links_json, change_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          revision,
          next.title,
          next.summary,
          next.content,
          stableJson(next.tags),
          stableJson(next.links),
          cleanString(patch.change_note || 'Memory updated', 400),
          updatedAt
        ]
      );
      await this.adapter.exec('COMMIT');
    } catch (error) {
      await this.adapter.exec('ROLLBACK');
      throw error;
    }

    return this.getEntry(id);
  }

  async deleteEntry(id) {
    await this.init();
    const existing = await this.getEntry(id);
    if (!existing) {
      return {
        deleted: false,
        id
      };
    }

    await this.adapter.exec('BEGIN');
    try {
      await this.adapter.run('DELETE FROM memory_revisions WHERE memory_id = ?', [id]);
      await this.adapter.run('DELETE FROM memory_entries WHERE id = ?', [id]);
      await this.adapter.exec('COMMIT');
    } catch (error) {
      await this.adapter.exec('ROLLBACK');
      throw error;
    }

    return {
      deleted: true,
      id
    };
  }

  async recall({
    query,
    projectPath,
    topic,
    kind,
    limit = 10
  }) {
    await this.init();
    const safeLimit = clampInt(limit, 10, 1, 50);
    const filters = ['status = ?'];
    const params = ['active'];

    if (projectPath) {
      filters.push('scope_project_path = ?');
      params.push(projectPath);
    }
    if (topic) {
      filters.push('topic = ?');
      params.push(topic);
    }
    if (kind) {
      filters.push('kind = ?');
      params.push(kind);
    }

    const rows = await this.adapter.all(
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
        const haystack = [
          row.title,
          row.summary,
          row.content,
          row.topic,
          row.feature,
          row.tags_json
        ].join('\n').toLowerCase();

        let score = row.importance / 100;
        for (const term of terms) {
          if (row.title.toLowerCase().includes(term)) score += 5;
          if (row.summary.toLowerCase().includes(term)) score += 3;
          if (haystack.includes(term)) score += 1;
        }
        if (projectPath && row.scope_project_path === projectPath) score += 2;
        if (topic && row.topic === topic) score += 1;
        if (row.last_recalled_at) score += Math.min(row.recall_count || 0, 5) * 0.1;

        return {
          score,
          entry: this.deserializeEntry(row)
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit);

    const recalledAt = nowIso();
    for (const item of ranked) {
      await this.adapter.run(
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
        score: Number(item.score.toFixed(3)),
        memory: item.entry
      }))
    };
  }

  async captureEvent(input) {
    await this.init();
    const scope = normalizeScope(input.scope);
    const eventType = cleanString(input.event_type || input.eventType || 'task', 60) || 'task';
    const title = cleanString(input.title, 400);
    const summary = cleanString(input.summary, 4000);
    const content = cleanString(input.content, 20000);
    const tags = ensureArray(input.tags);
    const links = normalizeLinks(input.links);
    const sourceRef = cleanString(input.source_ref || input.sourceRef, 1000);
    const createdAt = nowIso();
    const signalScore = this.computeSignalScore({
      eventType,
      status: input.status,
      importance: input.importance,
      filesChanged: input.files_changed || input.filesChanged,
      hasTests: input.has_tests || input.hasTests,
      tags,
      content,
      summary
    });

    if (!title) throw new Error('title is required');
    if (!content && !summary) throw new Error('content or summary is required');

    const record = {
      eventType,
      title,
      summary,
      content: content || summary,
      scope,
      tags,
      links,
      sourceRef,
      signalScore,
      status: signalScore >= 3 ? 'processed' : 'ignored'
    };

    let promotedMemoryId = null;
    if (signalScore >= 3) {
      const result = await this.storeEntry({
        kind: input.kind || (eventType === 'preference' ? 'preference' : 'knowledge'),
        title,
        summary,
        content: content || summary,
        status: input.memory_status || 'active',
        importance: input.importance === undefined ? Math.min(95, Math.round(signalScore * 20)) : input.importance,
        confidence: input.confidence === undefined ? Math.min(0.95, 0.45 + (signalScore * 0.1)) : input.confidence,
        tags,
        links,
        scope,
        source_type: 'capture-event',
        source_ref: sourceRef,
        change_note: `Auto-captured from ${eventType} event`
      });
      promotedMemoryId = result.memory?.id || null;
      record.status = result.duplicate ? 'duplicate' : 'promoted';
    }

    const insert = await this.adapter.run(
      `INSERT INTO memory_events(
        event_type, title, summary, content, status, signal_score, promoted_memory_id,
        scope_root_path, scope_project_path, scope_branch_name, topic, feature,
        tags_json, links_json, source_ref, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.eventType,
        record.title,
        record.summary,
        record.content,
        record.status,
        signalScore,
        promotedMemoryId,
        scope.root_path,
        scope.project_path,
        scope.branch_name,
        scope.topic,
        scope.feature,
        stableJson(tags),
        stableJson(links),
        sourceRef,
        createdAt
      ]
    );

    return {
      event_id: insert.lastInsertRowid,
      event_type: eventType,
      signal_score: Number(signalScore.toFixed(2)),
      status: record.status,
      promoted_memory_id: promotedMemoryId
    };
  }

  async listEvents({ limit = 20, offset = 0, projectPath } = {}) {
    await this.init();
    const filters = [];
    const params = [];
    if (projectPath) {
      filters.push('scope_project_path = ?');
      params.push(projectPath);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const countRow = await this.adapter.get(`SELECT COUNT(*) AS c FROM memory_events ${where}`, params);
    const safeLimit = clampInt(limit, 20, 1, 200);
    const safeOffset = clampInt(offset, 0, 0, 100000);
    const rows = await this.adapter.all(
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

  computeSignalScore({
    eventType,
    status,
    importance,
    filesChanged,
    hasTests,
    tags,
    content,
    summary
  }) {
    let score = 0;
    const normalizedType = String(eventType || '').toLowerCase();
    const normalizedStatus = String(status || '').toLowerCase();
    const text = `${summary || ''}\n${content || ''}`.toLowerCase();

    if (['bugfix', 'decision', 'review', 'preference'].includes(normalizedType)) score += 2;
    if (['completed', 'resolved', 'merged'].includes(normalizedStatus)) score += 1.5;
    if (Number.isFinite(Number(importance))) score += Math.min(2, Number(importance) / 50);
    if (Number.isFinite(Number(filesChanged)) && Number(filesChanged) > 0) score += Math.min(1.5, Number(filesChanged) * 0.2);
    if (hasTests) score += 0.75;
    if ((tags || []).length > 0) score += Math.min(1, (tags || []).length * 0.2);
    if (/fix|resolved|decided|remember|always|never|prefer|constraint|important/.test(text)) score += 1;

    return score;
  }

  deserializeEntry(row) {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      content: row.content,
      status: row.status,
      importance: row.importance,
      confidence: row.confidence,
      scope_root_path: row.scope_root_path,
      scope_project_path: row.scope_project_path,
      scope_branch_name: row.scope_branch_name,
      topic: row.topic,
      feature: row.feature,
      tags: JSON.parse(row.tags_json || '[]'),
      links: JSON.parse(row.links_json || '[]'),
      source_type: row.source_type,
      source_ref: row.source_ref,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_recalled_at: row.last_recalled_at,
      recall_count: row.recall_count
    };
  }
}
