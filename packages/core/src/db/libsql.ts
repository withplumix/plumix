import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import type { PlumixEnv } from "../runtime/bindings.js";
import type { EnvInput } from "../runtime/env-input.js";
import type { DatabaseAdapter } from "../runtime/slots.js";
import { createDebugSqlLogger } from "../debug-bar/db-query.js";
import { traceSqlClient } from "../debug-bar/trace-libsql.js";
import { resolveEnvInput } from "../runtime/env-input.js";

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
  // Built on first connect, not in the factory, because a resolver needs the
  // request-time `env`; reused across requests since the client owns a
  // connection pipeline. `env` is isolate-stable, so the first value holds.
  let client: ReturnType<typeof createClient> | undefined;
  return {
    kind: "libsql",
    config,
    connect: (env, _request, schema) => {
      if (!client) {
        const resolved = resolveEnvInput(config, env as PlumixEnv);
        const raw = createClient({
          url: resolved.url,
          authToken: resolved.authToken,
        });
        // Dev-only: time each query as a span for the Timeline panel.
        client = process.env.PLUMIX_DEV ? traceSqlClient(raw) : raw;
      }
      return {
        db: drizzle(client, {
          schema,
          casing: "snake_case",
          // Dev-only: feed the debug bar's Database panel. Tree-shaken in prod.
          logger: process.env.PLUMIX_DEV ? createDebugSqlLogger() : undefined,
        }),
      };
    },
  };
}
