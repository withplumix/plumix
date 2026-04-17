import type { FetchHandler, RuntimeAdapter } from "@plumix/core";

const notImplemented = (what: string) => () =>
  Promise.reject(
    new Error(`@plumix/runtime-cloudflare: ${what} is not yet implemented`),
  );

const pendingHandler: FetchHandler = () =>
  new Response("plumix cloudflare adapter is not yet wired", { status: 500 });

export function cloudflare(): RuntimeAdapter {
  return {
    name: "cloudflare",
    buildFetchHandler: () => pendingHandler,
    cli: {
      dev: notImplemented("dev"),
      build: notImplemented("build"),
      deploy: notImplemented("deploy"),
      types: notImplemented("types"),
      migrate: notImplemented("migrate"),
    },
  };
}
