import { DurableObject } from "cloudflare:workers";

import type { DemoSeed, DemoSqlExecutor } from "./storage.js";
import { dropDemoTables, initializeDemoStorage } from "./storage.js";

/** Result of a single statement executed over the DO's SQLite. */
export interface DemoQueryResult {
  /**
   * Rows as positional value arrays — the shape drizzle's `sqlite-proxy`
   * driver consumes (it maps columns by ordinal, not by name).
   */
  readonly rows: readonly unknown[][];
  /** Rows written; only meaningful for writes. */
  readonly rowsWritten: number;
}

/** A statement + positional bindings for batch execution. */
export interface DemoStatement {
  readonly sql: string;
  readonly params?: readonly unknown[];
}

/**
 * Per-session demo database. Each visitor's session cookie maps to one
 * `DemoDB` instance (`idFromName(token)`), giving isolated, ephemeral
 * SQLite storage. The Worker reaches this over RPC through a drizzle
 * `sqlite-proxy` driver (wired in the demo database adapter); this class
 * owns only storage access and the session lifecycle.
 */
export class DemoDB extends DurableObject {
  #sql: DemoSqlExecutor = {
    // `SqlStorage.exec` is synchronous; wrap it to satisfy the async
    // executor interface the storage lifecycle shares with the tests.
    runScript: (sql) => {
      this.ctx.storage.sql.exec(sql);
      return Promise.resolve();
    },
    query: (sql) => Promise.resolve(this.ctx.storage.sql.exec(sql).toArray()),
  };

  /** Apply schema + seed once. Idempotent; safe to call on every request. */
  async initialize(seed: DemoSeed): Promise<void> {
    // Serialize first-init: without this, two concurrent first requests can
    // both pass the "has tables" guard and race the seed's CREATE TABLE.
    await this.ctx.blockConcurrencyWhile(() =>
      initializeDemoStorage(this.#sql, seed),
    );
  }

  /** Arm the self-cleanup alarm `ttlSeconds` from now. */
  async setTtlAlarm(ttlSeconds: number): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + ttlSeconds * 1000);
  }

  /** Session expiry: reclaim storage by dropping every user table. */
  override async alarm(): Promise<void> {
    await dropDemoTables(this.#sql);
  }

  /** Execute one statement. Called over RPC by the sqlite-proxy driver. */
  query(sql: string, params: readonly unknown[] = []): DemoQueryResult {
    const cursor = this.ctx.storage.sql.exec(sql, ...params);
    return { rows: [...cursor.raw()], rowsWritten: cursor.rowsWritten };
  }

  /** Execute several statements in order, returning one result each. */
  batch(statements: readonly DemoStatement[]): DemoQueryResult[] {
    return statements.map((statement) =>
      this.query(statement.sql, statement.params ?? []),
    );
  }
}
