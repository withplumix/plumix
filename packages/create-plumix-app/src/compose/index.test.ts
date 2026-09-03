import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { CatalogContext } from "../catalog.js";
import type { AuthMethodDescriptor, RuntimeDescriptor } from "./types.js";
import { loadCatalogContext } from "../catalog.js";
import { REPO_ROOT } from "../test-support.js";
import { compose } from "./index.js";

const baseDir = fileURLToPath(new URL("../../base", import.meta.url));
// The base package.json pins `plumix` via `workspace:`, which only the live
// catalog resolves.
const ctx: Promise<CatalogContext> = loadCatalogContext(REPO_ROOT);

const runtime: RuntimeDescriptor = {
  id: "cloudflare",
  label: "Cloudflare",
  imports: [],
  configSlots: {},
  deps: {},
  devDeps: {},
  secretsFile: ".dev.vars",
  files: {},
};

const oauth: AuthMethodDescriptor = {
  id: "oauth",
  label: "OAuth",
  authEntry: "oauth: {}",
  envVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
};

const OAUTH_SECRETS =
  "# Local secrets for `plumix dev`. Fill these in; never commit real values.\n" +
  "GITHUB_CLIENT_ID=\nGITHUB_CLIENT_SECRET=\n";

const composeWith = async (
  rt: RuntimeDescriptor,
  authMethods: AuthMethodDescriptor[],
) =>
  compose({
    selection: { projectName: "my-app", runtime: rt, plugins: [], authMethods },
    baseDir,
    ctx: await ctx,
  });

describe("compose — local secrets file", () => {
  it("writes the auth methods' binding names to the runtime's secrets file", async () => {
    const files = await composeWith({ ...runtime, secretsFile: ".env" }, [
      oauth,
    ]);

    expect(files[".env"]).toBe(OAUTH_SECRETS);
    expect(files[".dev.vars"]).toBeUndefined();
  });

  it("keeps Cloudflare's .dev.vars byte for byte", async () => {
    const files = await composeWith(runtime, [oauth]);

    expect(files[".dev.vars"]).toBe(OAUTH_SECRETS);
  });

  it("writes no secrets file when nothing needs a binding", async () => {
    const files = await composeWith(runtime, []);

    expect(files[".dev.vars"]).toBeUndefined();
  });
});

describe("compose — .gitignore", () => {
  it("appends the runtime's ignores and its secrets file to the base list", async () => {
    const files = await composeWith(
      { ...runtime, gitignore: [".wrangler"] },
      [],
    );

    expect(files[".gitignore"]).toBe(
      "node_modules\ndist\n.plumix\n.cache\n.wrangler\n.dev.vars\n",
    );
  });

  it("names nothing wrangler-shaped for a runtime that contributes no ignores", async () => {
    const files = await composeWith({ ...runtime, secretsFile: ".env" }, []);

    expect(files[".gitignore"]).toBe(
      "node_modules\ndist\n.plumix\n.cache\n.env\n",
    );
  });
});
