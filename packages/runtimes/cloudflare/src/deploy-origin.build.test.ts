import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { plumix } from "plumix/vite";
import { build } from "vite";
import { afterEach, beforeEach, expect, test } from "vitest";

import type { DeployOrigin, DeployOriginInput } from "./deploy-origin.js";

const SOURCE = fileURLToPath(new URL("./deploy-origin.ts", import.meta.url));

let dir: string;

// `env` comes from `node:process` for a typed view the workers-types global
// would swallow; deploy-origin.ts cannot import it, or its reads escape the
// plugin's `define`.
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-deploy-origin-"));
  delete env.WORKERS_CI;
  delete env.WORKERS_CI_BRANCH;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Only the plugin's `define` carries the Workers Builds env into a bundle, so
 * a Node-level test cannot see this bug; bundle the way a deploy does.
 */
async function bundleWithPlumixDefine(): Promise<
  (input: DeployOriginInput) => DeployOrigin
> {
  const configFile = join(dir, "plumix.config.mjs");
  writeFileSync(
    configFile,
    `export default {
      runtime: { name: 'x', handler: {}, generateEntry: () => '' },
      database: { kind: 'x' },
      auth: { passkey: {} },
    };`,
    "utf8",
  );
  const configHook = plumix({ configFile }).config as (
    userConfig: unknown,
    configEnv: unknown,
  ) => Promise<{ define: Record<string, string> }>;
  const { define } = await configHook(
    { root: dir },
    { command: "build", mode: "production" },
  );

  const outDir = join(dir, "out");
  await build({
    root: dir,
    logLevel: "silent",
    define,
    // Vite keeps `process.env` intact in a server build, so the substitution
    // is the only carrier; minifying drops doc comments that mention the names.
    build: { outDir, ssr: SOURCE, minify: true },
  });

  const bundle = join(outDir, "deploy-origin.mjs");
  expect(readFileSync(bundle, "utf8")).not.toContain("WORKERS_CI");
  const mod = (await import(pathToFileURL(bundle).href)) as {
    cloudflareDeployOrigin: (input: DeployOriginInput) => DeployOrigin;
  };
  return mod.cloudflareDeployOrigin;
}

test("carries the Workers Builds env into the bundle, so a deploy resolves its real origin", async () => {
  env.WORKERS_CI = "1";
  env.WORKERS_CI_BRANCH = "main";
  const cloudflareDeployOrigin = await bundleWithPlumixDefine();
  // The deployed Worker has none of that env — only the substituted literals.
  delete env.WORKERS_CI;
  delete env.WORKERS_CI_BRANCH;

  expect(
    cloudflareDeployOrigin({ workerName: "site", accountSubdomain: "acct" }),
  ).toEqual({
    rpId: "acct.workers.dev",
    origin: "https://site.acct.workers.dev",
    allowedOrigins: ["https://*.acct.workers.dev"],
  });
});

// An unsubstituted `WORKERS_CI_BRANCH` reads as the default branch, so the
// production case passes whether or not that name crossed.
test("carries the branch name too, so a preview deploy resolves its per-branch host", async () => {
  env.WORKERS_CI = "1";
  env.WORKERS_CI_BRANCH = "feat/x";
  const cloudflareDeployOrigin = await bundleWithPlumixDefine();
  delete env.WORKERS_CI;
  delete env.WORKERS_CI_BRANCH;

  expect(
    cloudflareDeployOrigin({ workerName: "site", accountSubdomain: "acct" }),
  ).toEqual({
    rpId: "acct.workers.dev",
    origin: "https://feat-x-site.acct.workers.dev",
    allowedOrigins: ["https://*.acct.workers.dev"],
  });
});
