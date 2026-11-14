import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { plumix } from "./index.js";

type ConfigHook = (userConfig: unknown, env: unknown) => Promise<unknown>;

describe("plumix() vite plugin — magic link needs a mailer", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-vite-mailer-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function magicLinkConfig(mailer: string): ConfigHook {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: { name: 'x', handler: {}, generateEntry: () => '' },
        database: { kind: 'x' },
        auth: { passkey: {}, magicLink: { siteName: 'x' } },
        ${mailer}
      };`,
      "utf8",
    );
    return plumix({ configFile: configPath }).config as ConfigHook;
  }

  test("fails the build of a magic-link site with no mailer", async () => {
    const config = magicLinkConfig("");

    await expect(
      config({ root: dir }, { command: "build", mode: "production" }),
    ).rejects.toMatchObject({ code: "magic_link_requires_mailer" });
  });

  test("builds a magic-link site with a mailer", async () => {
    const config = magicLinkConfig("mailer: { send: async () => {} },");

    await expect(
      config({ root: dir }, { command: "build", mode: "production" }),
    ).resolves.toBeDefined();
  });

  test("serves a magic-link site with no mailer under dev", async () => {
    const config = magicLinkConfig("");

    await expect(
      config({ root: dir }, { command: "serve", mode: "development" }),
    ).resolves.toBeDefined();
  });
});
