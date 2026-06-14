import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import type { DatabaseAdapter } from "../runtime/slots.js";

export interface LibsqlConfig {
  /**
   * libSQL connection URL — `file:./data.db`, `:memory:`, or a remote
   * `libsql://` / `https://` endpoint (Turso, self-hosted sqld, …).
   */
  readonly url: string;
  readonly authToken?: string;
}

/**
 * Either literal connection config, or a resolver that derives it from the
 * runtime `env` at request time. The resolver form is required wherever the
 * connection secret only exists per-request — notably Cloudflare Workers,
 * where `env` (not `process.env`) carries bindings and the config module is
 * evaluated before any request. The literal form fits Node/Docker, where the
 * URL (including a `file:` path on shared storage) is known at config time.
 */
export type LibsqlConfigInput = LibsqlConfig | ((env: unknown) => LibsqlConfig);

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
        const resolved = typeof config === "function" ? config(env) : config;
        client = createClient({
          url: resolved.url,
          authToken: resolved.authToken,
        });
      }
      return { db: drizzle(client, { schema, casing: "snake_case" }) };
    },
  };
}
