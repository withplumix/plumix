import { describe, expect, test } from "vitest";

import { github, google } from "../../src/auth/oauth/providers/index.js";
import { fakeMail } from "../../src/test/mail-fake.js";
import { testSite } from "../../src/test/site.js";

const passkeyOnly = await testSite({ plugins: [] });

/** Magic link needs a mailer; the site swaps in its own fake for it. */
const withMagicLink = await testSite({
  config: { mailer: fakeMail(), auth: { magicLink: { siteName: "Acme" } } },
});

const client = { clientId: "id", clientSecret: "secret" };
const withOauth = await testSite({
  config: {
    auth: {
      oauth: { providers: { github: github(client), google: google(client) } },
    },
  },
});

describe("a site's sign-in methods", () => {
  test("are passkey alone for a passkey-only config", async () => {
    const result = await passkeyOnly.rpc.auth.signInMethods({});

    expect(result).toEqual({
      methods: [{ name: "passkey", label: "Passkey" }],
      oauth: [],
    });
  });

  test("include magic link when the site configures it", async () => {
    const result = await withMagicLink.rpc.auth.signInMethods({});

    expect(result.methods).toContainEqual({
      name: "magic-link",
      label: "Magic link",
    });
  });

  test("name each configured OAuth provider with its label, in declared order", async () => {
    const result = await withOauth.rpc.auth.signInMethods({});

    expect(result.oauth).toEqual([
      { key: "github", label: "GitHub" },
      { key: "google", label: "Google" },
    ]);
  });
});
