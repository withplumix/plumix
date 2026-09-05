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

describe("emitPlumixSources — what a runtime command reads back", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-emit-runtime-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns the config's runtime adapter, so a dev command that defers the app still sees its own options", async () => {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: {
          name: 'x',
          config: { build: { external: ['my-native'] } },
          createHandler: () => ({ fetch: () => new Response('ok') }),
          generateEntry: () => '',
        },
        database: { kind: 'x' },
        auth: { passkey: {} },
        theme: { templates: () => null },
        plugins: [],
      };`,
      "utf8",
    );

    const emitted = await emitPlumixSources(dir, configPath);

    expect(emitted.configPath).toBe(configPath);
    expect(emitted.runtime).toMatchObject({
      name: "x",
      config: { build: { external: ["my-native"] } },
    });
  });

  test("re-evaluates the config on request, for a caller whose environment changed since the cold-start evaluation", async () => {
    // A `.ts` config goes through jiti's transform; a `.mjs` one is imported
    // natively, which Node caches for the life of the process.
    const configPath = join(dir, "plumix.config.ts");
    const config = (name: string) => `export default {
        runtime: {
          name: ${JSON.stringify(name)},
          createHandler: () => ({ fetch: () => new Response('ok') }),
          generateEntry: () => '',
        },
        database: { kind: 'x' },
        auth: { passkey: {} },
        theme: { templates: () => null },
        plugins: [],
      };`;
    writeFileSync(configPath, config("first"), "utf8");
    await emitPlumixSources(dir, configPath);
    writeFileSync(configPath, config("second"), "utf8");

    expect((await emitPlumixSources(dir, configPath)).runtime.name).toBe(
      "first",
    );
    expect(
      (await emitPlumixSources(dir, configPath, { fresh: true })).runtime.name,
    ).toBe("second");
  });
});
