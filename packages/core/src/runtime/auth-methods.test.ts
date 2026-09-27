import { describe, expect, test } from "vitest";

import { auth } from "../auth/config.js";
import { github, google } from "../auth/oauth/providers/index.js";
import { resolveAuthMethods } from "./app.js";

const passkey = {
  rpName: "Plumix",
  rpId: "cms.example",
  origin: "https://cms.example",
};

describe("resolveAuthMethods", () => {
  test("reports passkey on and magic-link off for a passkey-only config", () => {
    expect(resolveAuthMethods(auth({ passkey }))).toEqual({
      passkey: true,
      magicLink: false,
      oauth: [],
    });
  });

  test("toggling magic-link in config flips what the accessor reports", () => {
    expect(resolveAuthMethods(auth({ passkey })).magicLink).toBe(false);
    expect(
      resolveAuthMethods(auth({ passkey, magicLink: { siteName: "Acme" } }))
        .magicLink,
    ).toBe(true);
  });

  test("projects each OAuth provider to its key and label, in declared order", () => {
    const client = { clientId: "id", clientSecret: "secret" };
    expect(
      resolveAuthMethods(
        auth({
          passkey,
          oauth: {
            providers: { github: github(client), google: google(client) },
          },
        }),
      ).oauth,
    ).toEqual([
      { key: "github", label: "GitHub" },
      { key: "google", label: "Google" },
    ]);
  });
});
