import { describe, expect, test } from "vitest";

import type { MetaBoxField } from "../plugin/manifest.js";
import type { PluginSetupContext } from "../plugin/setup-context.js";
import { auth } from "../auth/config.js";
import { plumix } from "../config.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";

declare module "../plugin/image-roles.js" {
  interface ImageRoles {
    backdrop: true;
  }
}

const stubAdapter = {
  name: "test" as const,
  createHandler: () => ({ fetch: () => new Response("stub") }),
  generateEntry: () => "",
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) } as const;
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});
const stubTheme = defineTheme({ templates: [fallback(() => null)] });

const backdrop: MetaBoxField = {
  key: "backdrop",
  label: "Backdrop",
  type: "json",
  inputType: "media",
  referenceTarget: { kind: "media", scope: { accept: "image/" } },
  role: "backdrop",
};

const appWith = (setup: (ctx: PluginSetupContext) => void): Promise<unknown> =>
  buildApp(
    plumix({
      runtime: stubAdapter,
      database: stubDatabase,
      auth: stubAuth,
      theme: stubTheme,
      plugins: [definePlugin("profiles", setup)],
    }),
  );

// The Vite manifest build is not the only boot: a runtime that builds the app
// straight from config has to fail on the same misdeclared role.
describe("buildApp — image role validation", () => {
  test("rejects a field in a role nobody registered", async () => {
    await expect(
      appWith((ctx) => {
        ctx.registerUserMetaBox("profile", {
          label: "Profile",
          fields: [backdrop],
        });
      }),
    ).rejects.toThrow(
      'Field "backdrop" on users has image role "backdrop", which no plugin registered.',
    );
  });

  test("sees a role a plugin registers once the theme is ready", async () => {
    await expect(
      appWith((ctx) => {
        ctx.addAction("theme:ready", () => {
          ctx.registerImageRole("backdrop", { single: true });
          ctx.registerUserMetaBox("profile", {
            label: "Profile",
            fields: [backdrop],
          });
        });
      }),
    ).resolves.toBeDefined();
  });
});
