import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import type { EnvInput } from "../runtime/env-input.js";
import type { DatabaseAdapter } from "../runtime/slots.js";
import { resolveEnvInput } from "../runtime/env-input.js";
import { traceSqlClient } from "./trace-libsql.js";

export interface LibsqlConfig {
  /**
   * libSQL connection URL — `file:./data.db`, `:memory:`, or a remote
   * `libsql://` / `https://` endpoint (Turso, self-hosted sqld, …).
   */
  readonly url: string;
  readonly authToken?: string;
}

/**
 * Literal connection config, or an `(env) => LibsqlConfig` resolver for the
 * Workers case where the auth token only exists in the per-request `env`. See
 * {@link EnvInput} for the shared union + the typed `env`.
 */
export type LibsqlConfigInput = EnvInput<LibsqlConfig>;

export interface LibsqlDatabaseAdapter extends DatabaseAdapter {
  readonly config: LibsqlConfigInput;
}

/**
 * Database adapter for any libSQL-compatible SQLite endpoint. Lives behind
 * the `@plumix/core/db/libsql` subpath so the driver only loads when this
 * adapter is imported — D1 deployments never pull it into their bundle.
 *
 * Single endpoint, strong consistency: no `connectRequest` read-replica hook
 * (that's D1's Sessions API), and no `requiredBindings` since the connection
 * comes from config rather than a runtime env binding.
 */
export function libsql(config: LibsqlConfigInput): LibsqlDatabaseAdapter {
  return {
    kind: "libsql",
    config,
    // A resolver needs the runtime `env`, so the client is built here rather
    // than in the factory. The handler binds `connect` once per its life.
    connect: (env, _request, schema) => {
      const resolved = resolveEnvInput(config, env);
      // Unconditional: spans are no-ops unless a telemetry consumer
      // sampled the request, so production without consumers pays nothing.
      const client = traceSqlClient(
        createClient({ url: resolved.url, authToken: resolved.authToken }),
      );
      return { db: drizzle(client, { schema, casing: "snake_case" }) };
    },
  };
}
