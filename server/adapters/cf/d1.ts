import type { DbAdapter, SqlParam } from "../../types.js";

export class D1DbAdapter implements DbAdapter {
  constructor(private readonly db: D1Database) {}

  async queryAll<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const bound = params.length > 0 ? stmt.bind(...params) : stmt;
    const result = await bound.all<T>();
    return result.results ?? [];
  }

  async queryFirst<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const bound = params.length > 0 ? stmt.bind(...params) : stmt;
    const row = await bound.first<T>();
    return row ?? null;
  }

  async execute(sql: string, params: SqlParam[] = []): Promise<{ changes: number }> {
    const stmt = this.db.prepare(sql);
    const bound = params.length > 0 ? stmt.bind(...params) : stmt;
    const result = await bound.run();
    return { changes: result.meta?.changes ?? 0 };
  }

  async execBatch(sql: string): Promise<void> {
    await this.db.exec(sql);
  }
}
