import type { ConnectedKv, KV, KvListOptions, KvPutOptions } from "plumix";

import type { WorkerEnv } from "./read-env.js";
import { KvError } from "./errors.js";

export interface KVConfig {
  readonly binding: string;
}

export interface KVInstance extends KV {
  readonly config: KVConfig;
}

// Structural shape of a Workers KV namespace — typed locally so the runtime
// doesn't take a hard `@cloudflare/workers-types` dependency at this boundary.
interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export function kv(config: KVConfig): KVInstance {
  return {
    kind: "kv",
    config,
    requiredBindings: [config.binding],
    connect(env): ConnectedKv {
      const ns = readKvBinding(env, config.binding);
      return {
        get: (key) => ns.get(key),
        put: (key, value, opts?: KvPutOptions) =>
          ns.put(
            key,
            value,
            opts?.expirationTtl !== undefined
              ? { expirationTtl: opts.expirationTtl }
              : undefined,
          ),
        delete: (key) => ns.delete(key),
        async list(opts: KvListOptions = {}) {
          const result = await ns.list({
            prefix: opts.prefix,
            limit: opts.limit,
            cursor: opts.cursor,
          });
          return {
            keys: result.keys.map((k) => k.name),
            // The binding only carries a cursor while more keys remain; mirror
            // that into the "cursor iff not complete" shape of the KV contract.
            cursor: result.list_complete ? undefined : result.cursor,
            listComplete: result.list_complete,
          };
        },
      };
    },
  };
}

function readKvBinding(env: unknown, bindingName: string): KvNamespace {
  const binding = (env as WorkerEnv | null)?.[bindingName];
  if (
    binding === null ||
    typeof binding !== "object" ||
    typeof (binding as { get?: unknown }).get !== "function"
  ) {
    throw KvError.bindingMissing({ binding: bindingName });
  }
  return binding as KvNamespace;
}
