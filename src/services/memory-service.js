import fs from 'node:fs';
import path from 'node:path';
import { MemoryStore } from './memory-store.js';

function parseNodeMajor(version) {
  const major = Number.parseInt(String(version || '').split('.')[0] || '0', 10);
  return Number.isFinite(major) ? major : 0;
}

export class MemoryService {
  constructor({
    localnestHome,
    enabled,
    backend,
    dbPath,
    autoCapture,
    consentDone
  }) {
    this.localnestHome = localnestHome;
    this.enabled = enabled;
    this.backend = backend;
    this.dbPath = dbPath;
    this.autoCapture = autoCapture;
    this.consentDone = consentDone;
    this.store = new MemoryStore({
      enabled,
      backend,
      dbPath
    });
  }

  async detectBackend() {
    const requested = this.backend || 'auto';
    const nodeMajor = parseNodeMajor(process.versions?.node);

    if (requested === 'node-sqlite') {
      return {
        requested,
        selected: await this._supportsNodeSqlite() ? 'node-sqlite' : null,
        available: await this._supportsNodeSqlite()
      };
    }

    if (requested === 'sqlite3') {
      return {
        requested,
        selected: null,
        available: false,
        reason: 'sqlite3 fallback is disabled in published builds due to upstream audit vulnerabilities'
      };
    }

    const supportsNodeSqlite = await this._supportsNodeSqlite();
    if (supportsNodeSqlite) {
      return {
        requested,
        selected: 'node-sqlite',
        available: true,
        reason: nodeMajor >= 22 ? 'built-in node:sqlite available' : 'node:sqlite available'
      };
    }

    return {
      requested,
      selected: null,
      available: false,
      reason: 'No supported SQLite backend detected. Use Node 22.13+ for local memory support.'
    };
  }

  async getStatus() {
    const backend = await this.detectBackend();
    let storeStatus = {
      initialized: false
    };

    if (this.enabled && backend.available) {
      try {
        storeStatus = await this.store.getStatus();
      } catch (error) {
        storeStatus = {
          initialized: false,
          error: error?.message || String(error)
        };
      }
    }

    return {
      enabled: this.enabled,
      auto_capture: this.autoCapture,
      consent_done: this.consentDone,
      requested_backend: this.backend,
      backend,
      db_path: this.dbPath,
      db_exists: fs.existsSync(this.dbPath),
      db_dir: path.dirname(this.dbPath),
      localnest_home: this.localnestHome,
      store: storeStatus
    };
  }

  async listEntries(args = {}) {
    this.assertEnabled();
    return this.store.listEntries(args);
  }

  async getEntry(id) {
    this.assertEnabled();
    return this.store.getEntry(id);
  }

  async storeEntry(input) {
    this.assertEnabled();
    return this.store.storeEntry(input);
  }

  async updateEntry(id, patch) {
    this.assertEnabled();
    return this.store.updateEntry(id, patch);
  }

  async deleteEntry(id) {
    this.assertEnabled();
    return this.store.deleteEntry(id);
  }

  async recall(args = {}) {
    this.assertEnabled();
    return this.store.recall(args);
  }

  async captureEvent(input = {}) {
    this.assertEnabled();
    if (!this.autoCapture) {
      throw new Error('Automatic memory capture is disabled. Re-run localnest-mcp-setup and enable memory capture.');
    }
    return this.store.captureEvent(input);
  }

  async listEvents(args = {}) {
    this.assertEnabled();
    return this.store.listEvents(args);
  }

  assertEnabled() {
    if (!this.enabled) {
      throw new Error('Local memory is disabled. Re-run localnest-mcp-setup and opt in to memory.');
    }
  }

  async _supportsNodeSqlite() {
    try {
      const mod = await import('node:sqlite');
      return Boolean(mod?.DatabaseSync);
    } catch {
      return false;
    }
  }
}
