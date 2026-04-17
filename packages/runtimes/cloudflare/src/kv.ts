import type { KV } from "@plumix/core";

export interface KVConfig {
  readonly binding: string;
}

export interface KVInstance extends KV {
  readonly config: KVConfig;
}

export function kv(config: KVConfig): KVInstance {
  return {
    kind: "kv",
    config,
  };
}
