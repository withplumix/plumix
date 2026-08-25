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

// `env` comes from `node:process` for a typed view the @cloudflare/workers-types
// global would otherwise swallow. deploy-origin.ts itself cannot import it: the
// specifier would put its reads out of reach of the plugin's `define`.
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-deploy-origin-"));
  delete env.WORKERS_CI;
  delete env.WORKERS_CI_BRANCH;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// Only the plugin's `define` carries the Workers Builds env into a deployed
// bundle, so a Node-level test — mutating a live `process.env` no deploy has —
// cannot see this class of bug. Bundle the way a deploy does, taking the define
// map off the plugin so a rename on either side can't drift past it (#1947).
async function bundleWithPlumixDefine(): Promise<
  (input: DeployOriginInput) => DeployOrigin
> {
  const configFile = join(dir, "plumix.config.mjs");
  writeFileSync(
    configFile,
    `export default {
      runtime: { name: 'x', buildFetchHandler: () => () => new Response('ok') },
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
    // A server build, like the worker half of `plumix build`: Vite keeps
    // `process.env` intact here instead of collapsing it to `{}`, so the
    // substitution is the only thing that can carry these names across.
    // Minifying matches a real deploy and drops the doc comments that mention
    // them, leaving the assertion below to speak about code.
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

// The branch needs its own case: an unsubstituted `WORKERS_CI_BRANCH` reads as
// `undefined`, which the helper treats as the default branch — so the
// production case above passes whether or not that second name crossed.
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
