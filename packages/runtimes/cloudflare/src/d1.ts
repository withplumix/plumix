import { drizzle } from "drizzle-orm/d1";

import type { DatabaseAdapter } from "@plumix/core";

export interface D1Config {
  readonly binding: string;
}

export interface D1DatabaseAdapter extends DatabaseAdapter {
  readonly config: D1Config;
}

export function d1(config: D1Config): D1DatabaseAdapter {
  return {
    kind: "d1",
    config,
    connect: (env, _request, schema) => {
      const bindings = env as Record<string, D1Database | undefined>;
      const binding = bindings[config.binding];
      if (!binding) {
        throw new Error(
          `@plumix/runtime-cloudflare: D1 binding "${config.binding}" missing from env`,
        );
      }
      const db = drizzle(binding, {
        schema,
        casing: "snake_case",
      });
      return { db };
    },
  };
}
