import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { emitPlumixSources } from "./index.js";

describe("emitPlumixSources — the entry comes from the config's runtime adapter", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-emit-entry-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(generateEntry: string): string {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: {
          name: 'x',
          createHandler: () => ({ fetch: () => new Response('ok') }),
          generateEntry: ${generateEntry},
        },
        database: { kind: 'x' },
        auth: { passkey: {} },
        theme: { templates: () => null },
        plugins: [],
      };`,
      "utf8",
    );
    return configPath;
  }

  test("writes what the adapter returns, verbatim", async () => {
    const configPath = writeConfig("() => '// entry from the adapter\\n'");

    await emitPlumixSources(dir, configPath);

    expect(readFileSync(join(dir, ".plumix/worker.ts"), "utf8")).toBe(
      "// entry from the adapter\n",
    );
  });

  test("hands the adapter the specifier the entry imports the config from", async () => {
    const configPath = writeConfig("({ configModule }) => configModule");

    await emitPlumixSources(dir, configPath);

    // Relative to `.plumix/`, one level below the project root.
    expect(readFileSync(join(dir, ".plumix/worker.ts"), "utf8")).toBe(
      "../plumix.config.mjs",
    );
  });
});
