import type { DatabaseAdapter } from "@plumix/core";

export interface D1Config {
  readonly binding: string;
  readonly session?: "disabled" | "auto" | "primary-first";
  readonly bookmarkCookie?: string;
}

export interface D1DatabaseAdapter extends DatabaseAdapter {
  readonly config: D1Config;
}

export function d1(config: D1Config): D1DatabaseAdapter {
  return {
    kind: "d1",
    config,
    connect: () => ({
      db: {},
      commit: () => null,
    }),
  };
}
