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

const scripts = (raw: string | undefined) =>
  (JSON.parse(raw ?? "{}") as { scripts: Record<string, string> }).scripts;

describe("compose — .gitignore and clean", () => {
  it("appends the runtime's ignores to .gitignore and to what clean removes", async () => {
    const files = await composeWith(
      { ...runtime, gitignore: [".wrangler"] },
      [],
    );

    expect(files[".gitignore"]).toBe(
      "node_modules\ndist\n.plumix\n.cache\n.wrangler\n.dev.vars\n",
    );
    expect(scripts(files["package.json"]).clean).toBe(
      "git clean -xdf .plumix dist node_modules .wrangler",
    );
  });

  it("names nothing wrangler-shaped for a runtime that contributes no ignores", async () => {
    const files = await composeWith({ ...runtime, secretsFile: ".env" }, []);

    expect(files[".gitignore"]).toBe(
      "node_modules\ndist\n.plumix\n.cache\n.env\n",
    );
    expect(scripts(files["package.json"]).clean).not.toContain(".wrangler");
  });
});

describe("compose — what the runtime decides about the base skeleton", () => {
  it("lists the runtime's ambient types beside node and react in the tsconfig", async () => {
    const files = await composeWith(
      { ...runtime, types: ["@cloudflare/workers-types"] },
      [],
    );
    const bare = await composeWith(runtime, []);

    expect(JSON.parse(files["tsconfig.json"] ?? "{}")).toMatchObject({
      compilerOptions: {
        types: ["node", "@cloudflare/workers-types", "react"],
      },
    });
    expect(JSON.parse(bare["tsconfig.json"] ?? "{}")).toMatchObject({
      compilerOptions: { types: ["node", "react"] },
    });
  });

  it("appends the runtime's deploy notes to the README with the project name filled in, and nothing when it has none", async () => {
    const files = await composeWith(
      { ...runtime, readme: "Run `wrangler d1 create __PROJECT_NAME__`.\n" },
      [],
    );
    const bare = await composeWith(runtime, []);

    expect(files["README.md"]).toContain(
      "## Deploy\n\nRun `wrangler d1 create my-app`.",
    );
    expect(bare["README.md"]).not.toContain("## Deploy");
    expect(bare["README.md"]).not.toContain("wrangler");
  });
});
