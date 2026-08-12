import { describe, expect, test } from "vitest";

import { auth } from "../auth/config.js";
import { resolveAuthMethods } from "./app.js";

const passkey = {
  rpName: "Plumix",
  rpId: "cms.example",
  origin: "https://cms.example",
};

describe("resolveAuthMethods", () => {
  test("reports passkey on and magic-link off for a passkey-only config", () => {
    expect(resolveAuthMethods(auth({ passkey }), [])).toEqual({
      passkey: true,
      magicLink: false,
      oauthProviders: [],
    });
  });

  test("toggling magic-link in config flips what the accessor reports", () => {
    expect(resolveAuthMethods(auth({ passkey }), []).magicLink).toBe(false);
    expect(
      resolveAuthMethods(auth({ passkey, magicLink: { siteName: "Acme" } }), [])
        .magicLink,
    ).toBe(true);
  });

  test("passes the OAuth provider keys and labels through verbatim", () => {
    const providers = [
      { key: "github", label: "GitHub" },
      { key: "google", label: "Google" },
    ];
    expect(
      resolveAuthMethods(auth({ passkey }), providers).oauthProviders,
    ).toBe(providers);
  });
});
