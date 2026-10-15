import { defineAuthMethod, definePlugin } from "plumix/plugin";

import type fixtureClient from "./fixture-client.js";

/** The account the fixture method proves; the e2e setup seeds it. */
export const FIXTURE_EMAIL = "fixture@example.test";

declare module "plumix" {
  interface AuthMethodRegistry {
    fixture: typeof fixtureClient;
  }
}

/**
 * A sign-in method a plugin adds, its client half at an absolute path. It
 * proves one seeded address with no challenge, so it exists only here.
 */
export const fixtureSignIn = definePlugin("core-playground-fixture-sign-in", {
  setup: () => undefined,
  authMethods: [
    defineAuthMethod({
      name: "fixture",
      label: "Fixture",
      // A template string, not `new URL(…, import.meta.url)`: the worker
      // evaluates the config too, where only the build's read matters.
      client: `${import.meta.dirname}/fixture-client.ts`,
      routes: {
        "sign-in": {
          method: "POST",
          handler: (auth) =>
            auth.proveIdentity({ email: FIXTURE_EMAIL, emailVerified: true }),
        },
      },
    }),
  ],
});
