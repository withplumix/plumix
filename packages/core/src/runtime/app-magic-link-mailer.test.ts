import { afterEach, describe, expect, test, vi } from "vitest";

import { auth } from "../auth/config.js";
import { ConfigError } from "../config.errors.js";
import { buildApp } from "./app.js";
import { plumix } from "./define-config.js";

const stubAdapter = {
  name: "test" as const,
  handler: {},
  generateEntry: () => "",
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) } as const;

function magicLinkSite(mailer?: { send: () => Promise<void> }) {
  return plumix({
    runtime: stubAdapter,
    database: stubDatabase,
    auth: auth({
      passkey: { rpName: "t", rpId: "t", origin: "https://t" },
      magicLink: { siteName: "t" },
    }),
    ...(mailer === undefined ? {} : { mailer }),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildApp — magic link needs a mailer", () => {
  test("refuses to boot a magic-link site with no mailer", async () => {
    await expect(buildApp(magicLinkSite())).rejects.toMatchObject({
      code: "magic_link_requires_mailer",
    });
  });

  test("points at a real transport, not the console", async () => {
    const error: unknown = await buildApp(magicLinkSite()).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).hint).toContain("real transport");
    expect(String(error)).not.toContain("consoleMailer");
  });

  test("boots a magic-link site with a mailer", async () => {
    const mailer = { send: () => Promise.resolve() };

    await expect(buildApp(magicLinkSite(mailer))).resolves.toBeDefined();
  });

  test("boots a magic-link site with no mailer under plumix dev", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");

    await expect(buildApp(magicLinkSite())).resolves.toBeDefined();
  });

  test("builds the app an operator command runs against", async () => {
    await expect(
      buildApp(magicLinkSite(), { operatorCommand: true }),
    ).resolves.toBeDefined();
  });
});
