import { describe, expect, test } from "vitest";

import type { ThemeDescriptor } from "./theme.js";
import { auth } from "./auth/config.js";
import { plumix } from "./config.js";
import { buildApp } from "./runtime/app.js";
import { ThemeRegistrationError } from "./theme-errors.js";
import { defineTheme } from "./theme.js";

const stubAdapter = {
  name: "test",
  buildFetchHandler: () => () => new Response("stub"),
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) };
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});

// Bypass the compile-time `templates.index` requirement to simulate a
// hand-rolled descriptor that skipped the `defineTheme` factory.
const badTheme = { templates: {} } as unknown as ThemeDescriptor;

describe("defineTheme", () => {
  test("throws ThemeRegistrationError when templates.index is missing", () => {
    expect(() => defineTheme(badTheme)).toThrow(ThemeRegistrationError);
  });
});

describe("buildApp", () => {
  test("throws ThemeRegistrationError when config.theme omits templates.index", async () => {
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
