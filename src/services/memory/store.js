import fs from 'node:fs';
import path from 'node:path';
import { NodeSqliteAdapter } from './adapter.js';
import {
  ensureSchema as ensureMemorySchema,
  runMigrations as runMemoryMigrations
} from './schema.js';
import {
  getStoreStatus,
  listEntries as listMemoryEntries,
  getEntry as getMemoryEntry,
  storeEntry as storeMemoryEntry,
  updateEntry as updateMemoryEntry,
  deleteEntry as deleteMemoryEntry
} from './entries.js';
import {
  recall as recallFn,
  captureEvent as captureEventFn,
  listEvents as listEventsFn
} from './event-capture.js';
import {
  suggestRelations as suggestRelationsFn,
  addRelation as addRelationFn,
  removeRelation as removeRelationFn,
  getRelated as getRelatedFn
} from './relations.js';

export class MemoryStore {
  constructor({
    enabled,
    backend,
    dbPath,
    embeddingService
  }) {
    this.enabled = enabled;
    this.requestedBackend = backend || 'auto';
    this.dbPath = dbPath;
    this.embeddingService = embeddingService || null;
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
    await ensureMemorySchema(this.adapter);
    await runMemoryMigrations({
      adapter: this.adapter,
      getMeta: (key) => this.getMeta(key),
      setMeta: (key, value) => this.setMeta(key, value)
    });
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
    return getStoreStatus(this);
  }

  async listEntries(args) {
    return listMemoryEntries(this, args);
  }

  async getEntry(id) {
    return getMemoryEntry(this, id);
  }

  async storeEntry(input) {
    return storeMemoryEntry(this, input);
  }

  async updateEntry(id, patch = {}) {
    return updateMemoryEntry(this, id, patch);
  }

  async deleteEntry(id) {
    return deleteMemoryEntry(this, id);
  }

  async recall(args) {
    await this.init();
    return recallFn(this.adapter, args);
  }

  async captureEvent(input) {
    await this.init();
    return captureEventFn(this.adapter, input, {
      storeEntry: (args) => this.storeEntry(args),
      updateEntry: (id, patch) => this.updateEntry(id, patch)
    });
  }

  async listEvents(args) {
    await this.init();
    return listEventsFn(this.adapter, args);
  }

  async suggestRelations(memoryId, opts) {
    await this.init();
    return suggestRelationsFn(this.adapter, memoryId, opts);
  }

  async addRelation(sourceId, targetId, relationType) {
    await this.init();
    return addRelationFn(this.adapter, sourceId, targetId, relationType);
  }

  async removeRelation(sourceId, targetId) {
    await this.init();
    return removeRelationFn(this.adapter, sourceId, targetId);
  }

  async getRelated(memoryId) {
    await this.init();
    return getRelatedFn(this.adapter, memoryId);
  }
}
