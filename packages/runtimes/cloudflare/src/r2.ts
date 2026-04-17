import type { ObjectStorage } from "@plumix/core";

export interface R2Config {
  readonly binding: string;
}

export interface R2ObjectStorage extends ObjectStorage {
  readonly config: R2Config;
}

export function r2(config: R2Config): R2ObjectStorage {
  return {
    kind: "r2",
    config,
  };
}
