import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { diagnose } from "./diagnose.js";

describe("diagnose", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-diagnose-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("warns when the wrangler config leaves Workers Logs off, with the block to add", () => {
    writeFileSync(join(dir, "wrangler.jsonc"), `{ "name": "app" }`);

    expect(diagnose(dir)).toEqual([
      {
        level: "warn",
        message:
          "Workers Logs is off in wrangler.jsonc, so the deployed Worker keeps no logs",
        fix: 'Add to wrangler.jsonc: "observability": { "enabled": true }',
      },
    ]);
  });

  test("reports Workers Logs on when the config enables observability", () => {
    writeFileSync(
      join(dir, "wrangler.jsonc"),
      `{ "name": "app", "observability": { "enabled": true } }`,
    );

    expect(diagnose(dir)).toEqual([
      { level: "ok", message: "Workers Logs is on in wrangler.jsonc" },
    ]);
  });

  test("gives the fix in TOML for a wrangler.toml", () => {
    writeFileSync(join(dir, "wrangler.toml"), `name = "app"\n`);

    expect(diagnose(dir)).toMatchObject([
      {
        level: "warn",
        fix: "Add to wrangler.toml:\n[observability]\nenabled = true",
      },
    ]);
  });

  test("lists every D1 target the wrangler config defines, and warns about a block without one", () => {
    writeFileSync(
      join(dir, "wrangler.jsonc"),
      JSON.stringify({
        name: "app",
        observability: { enabled: true },
        d1_databases: [
          {
            binding: "DB",
            database_name: "site-prod",
            database_id: "prod-id",
            preview_database_id: "dev-id",
          },
        ],
        previews: {
          d1_databases: [
            { binding: "DB", database_name: "site-preview", database_id: "p" },
          ],
        },
        env: {
          qa: {
            d1_databases: [
              { binding: "DB", database_name: "site-qa", database_id: "q" },
            ],
          },
          staging: {
            d1_databases: [
              { binding: "DB", database_name: "site-stg", database_id: "s" },
            ],
            previews: { vars: { MODE: "preview" } },
          },
          demo: {},
        },
      }),
    );

    expect(diagnose(dir)).toEqual([
      { level: "ok", message: "Workers Logs is on in wrangler.jsonc" },
      {
        level: "ok",
        message:
          "D1 top level: DB · site-prod (preview_database_id dev-id: wrangler dev only)",
      },
      { level: "ok", message: "D1 previews: DB · site-preview" },
      { level: "ok", message: "D1 env.qa: DB · site-qa" },
      {
        level: "ok",
        message:
          "D1 env.qa previews, inherited from top level: DB · site-preview",
      },
      { level: "ok", message: "D1 env.staging: DB · site-stg" },
      {
        level: "warn",
        message: "env.staging.previews in wrangler.jsonc binds no D1 database",
        fix: 'Add to env.staging.previews in wrangler.jsonc: "d1_databases": [{ "binding": "DB", "database_name": "<name>", "database_id": "<id>" }], with the id `wrangler d1 create <name>` prints.',
      },
      {
        level: "warn",
        message: "env.demo in wrangler.jsonc binds no D1 database",
        fix: 'Add to env.demo in wrangler.jsonc: "d1_databases": [{ "binding": "DB", "database_name": "<name>", "database_id": "<id>" }], with the id `wrangler d1 create <name>` prints.',
      },
      {
        level: "ok",
        message:
          "D1 env.demo previews, inherited from top level: DB · site-preview",
      },
    ]);
  });
});
