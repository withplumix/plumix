import { describe, expect, test } from "vitest";

import { github, google } from "../auth/oauth/providers/index.js";
import { defineAuthMethod } from "../plugin/auth-method.js";
import { definePlugin } from "../plugin/define.js";
import { testConfig } from "../test/config.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { buildApp } from "./app.js";

const client = { clientId: "id", clientSecret: "secret" };

function signingIn(id: string, name: string, listed?: boolean) {
  const method = defineAuthMethod({
    name,
    label: `${name} label`,
    listed,
    routes: { start: { method: "POST", handler: () => new Response(null) } },
  });
  return definePlugin(id, { authMethods: [method], setup: () => undefined });
}

describe("app.authMethods", () => {
  test("lists only passkey for a passkey-only config, leaving out invite", async () => {
    const app = await buildApp(testConfig());

    expect(app.authMethods).toEqual({
      methods: [{ name: "passkey", label: "Passkey" }],
      oauth: [],
    });
  });

  test("lists magic link and OAuth once configured, with each provider", async () => {
    const app = await buildApp(
      testConfig({
        mailer: { send: () => Promise.resolve() },
        auth: {
          magicLink: { siteName: "Acme" },
          oauth: {
            providers: { github: github(client), google: google(client) },
          },
        },
      }),
    );

    expect(app.authMethods).toEqual({
      methods: [
        { name: "passkey", label: "Passkey" },
        { name: "magic-link", label: "Magic link" },
        { name: "oauth", label: "OAuth" },
      ],
      oauth: [
        { key: "github", label: "GitHub" },
        { key: "google", label: "Google" },
      ],
    });
  });

  test("lists each plugin's method after core's, in plugin order", async () => {
    const app = await buildApp(
      testConfig({
        plugins: [signingIn("first", "fixture"), signingIn("second", "other")],
      }),
    );

    expect(app.authMethods.methods).toEqual([
      { name: "passkey", label: "Passkey" },
      { name: "fixture", label: "fixture label" },
      { name: "other", label: "other label" },
    ]);
  });

  test("leaves out a method declared with listed: false", async () => {
    const app = await buildApp(
      testConfig({ plugins: [signingIn("hidden", "fixture", false)] }),
    );

    expect(app.authMethods.methods).toEqual([
      { name: "passkey", label: "Passkey" },
    ]);
  });
});

describe("auth.signInMethods", () => {
  test("answers the listing, a plugin's method after core's", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [signingIn("fixture-plugin", "fixture")] },
    });

    const response = await h.fetch("/_plumix/rpc/auth/signInMethods", {
      method: "POST",
      json: {},
    });

    expect(await response.json()).toEqual({
      json: {
        methods: [
          { name: "passkey", label: "Passkey" },
          { name: "fixture", label: "fixture label" },
        ],
        oauth: [],
      },
    });
  });
});
