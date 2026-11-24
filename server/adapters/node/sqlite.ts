import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DbAdapter, SqlParam } from "../../types.js";

export class NodeSqliteAdapter implements DbAdapter {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
  }

  async queryAll<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as T[];
    return rows;
  }

  async queryFirst<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as T | undefined;
    return row ?? null;
  }

  async execute(sql: string, params: SqlParam[] = []): Promise<{ changes: number }> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return { changes: Number(result.changes ?? 0) };
  }

  async execBatch(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  applyMigrations(migrationsDir: string): void {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      this.db.exec(sql);
    }
  }

  close(): void {
    this.db.close();
  }
}
