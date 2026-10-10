import { DurableObject } from "cloudflare:workers";

import type { DemoSqlExecutor } from "./storage.js";
import { dropDemoTables, initializeDemoStorage } from "./storage.js";

/** Result of a single statement executed over the DO's SQLite. */
export interface DemoQueryResult {
  /**
   * Positional, as drizzle's `sqlite-proxy` maps columns by ordinal;
   * serializable across DO RPC.
   */
  readonly rows: SqlStorageValue[][];
  /** Rows written; only meaningful for writes. */
  readonly rowsWritten: number;
}

/** A statement + positional bindings for batch execution. */
export interface DemoStatement {
  readonly sql: string;
  readonly params?: readonly SqlStorageValue[];
}

/**
 * One instance per session token (`idFromName(token)`), giving isolated,
 * ephemeral SQLite.
 */
export class DemoDB extends DurableObject {
  #sql: DemoSqlExecutor = {
    // `SqlStorage.exec` is synchronous; wrap it to satisfy the async
    // executor interface the storage lifecycle shares with the tests.
    exec: (sql) => {
      this.ctx.storage.sql.exec(sql);
      return Promise.resolve();
    },
    query: (sql) => Promise.resolve(this.ctx.storage.sql.exec(sql).toArray()),
  };

  /** Apply the bootstrap SQL once. Idempotent; safe to call every request. */
  async initialize(bootstrapSql: string): Promise<void> {
    // Serialize first-init: without this, two concurrent first requests can
    // both pass the "has tables" guard and race the seed's CREATE TABLE.
    await this.ctx.blockConcurrencyWhile(() =>
      initializeDemoStorage(this.#sql, bootstrapSql),
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
  query(
    sql: string,
    params: readonly SqlStorageValue[] = [],
  ): Promise<DemoQueryResult> {
    return Promise.resolve(this.#exec(sql, params));
  }

  /** Execute several statements in order, returning one result each. */
  batch(statements: readonly DemoStatement[]): Promise<DemoQueryResult[]> {
    return Promise.resolve(
      statements.map((statement) =>
        this.#exec(statement.sql, statement.params ?? []),
      ),
    );
  }

  #exec(sql: string, params: readonly SqlStorageValue[]): DemoQueryResult {
    const cursor = this.ctx.storage.sql.exec(sql, ...params);
    return { rows: [...cursor.raw()], rowsWritten: cursor.rowsWritten };
  }
}
