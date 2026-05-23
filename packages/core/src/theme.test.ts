import { describe, expect, test } from "vitest";

import { plumix } from "./config.js";
import { auth } from "./auth/config.js";
import { buildApp } from "./runtime/app.js";
import { defineTheme } from "./theme.js";
import { ThemeRegistrationError } from "./theme-errors.js";

const stubAdapter = {
  name: "test",
  buildFetchHandler: () => () => new Response("stub"),
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) };
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});

describe("defineTheme", () => {
  test("throws ThemeRegistrationError when templates.index is missing", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      defineTheme({ templates: {} as any }),
    ).toThrow(ThemeRegistrationError);
  });
});

describe("buildApp", () => {
  test("throws ThemeRegistrationError when config.theme omits templates.index", async () => {
    // Bypass defineTheme's compile-time guard with `as any` to simulate
    // a hand-rolled descriptor that skipped the factory.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const badTheme = { templates: {} } as any;
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: badTheme,
        }),
      ),
    ).rejects.toThrow(ThemeRegistrationError);
  });
});
