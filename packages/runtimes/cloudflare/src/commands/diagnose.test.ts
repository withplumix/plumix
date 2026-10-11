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
});
