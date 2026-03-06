export class NodeSqliteAdapter {
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
