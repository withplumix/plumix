import { describe, expect, test } from "vitest";

import { defineAuthMethod } from "../plugin/auth-method.js";
import { definePlugin } from "../plugin/define.js";
import { testConfig } from "../test/config.js";
import { buildApp } from "./app.js";

function declaring(id: string, name: string) {
  const method = defineAuthMethod({
    name,
    label: "Fixture",
    routes: {
      start: { method: "POST", handler: () => new Response(null) },
    },
  });
  return definePlugin(id, { authMethods: [method], setup: () => undefined });
}

describe("buildApp — sign-in method declarations", () => {
  test("rejects two plugins declaring one name, naming both", async () => {
    await expect(
      buildApp(
        testConfig({
          plugins: [
            declaring("first", "fixture"),
            declaring("second", "fixture"),
          ],
        }),
      ),
    ).rejects.toThrow(
      'Plugin "second" declares sign-in method "fixture", already declared by "first".',
    );
  });

  test("rejects a plugin declaring core's oauth, naming core", async () => {
    await expect(
      buildApp(testConfig({ plugins: [declaring("social", "oauth")] })),
    ).rejects.toThrow(
      'Plugin "social" declares sign-in method "oauth", already declared by "core".',
    );
  });

  test.each(["Fixture", "fix_ture", "fixture-", "-fixture", "9lives", ""])(
    "rejects the name %j, which isn't a kebab-case slug",
    async (name) => {
      await expect(
        buildApp(testConfig({ plugins: [declaring("fixture-plugin", name)] })),
      ).rejects.toThrow(
        `Plugin "fixture-plugin" declares sign-in method "${name}", which is not a kebab-case slug.`,
      );
    },
  );

  test("rejects a name core's own auth routes answer at", async () => {
    await expect(
      buildApp(
        testConfig({ plugins: [declaring("fixture-plugin", "device")] }),
      ),
    ).rejects.toThrow(
      `Plugin "fixture-plugin" declares sign-in method "device", but core's /_plumix/auth/device routes answer there.`,
    );
  });

  test.each([
    ["account", "account"],
    ["url", "url"],
    ["use-account", "useAccount"],
    ["sign-in", "signIn"],
    ["sign-out", "signOut"],
    ["use-session", "useSession"],
    ["use-auth-methods", "useAuthMethods"],
    ["use-can", "useCan"],
    ["sessions", "sessions"],
    ["can", "can"],
  ])(
    "rejects %j, whose client half would take the auth client's %j",
    async (name, key) => {
      await expect(
        buildApp(testConfig({ plugins: [declaring("fixture-plugin", name)] })),
      ).rejects.toThrow(
        `Plugin "fixture-plugin" declares sign-in method "${name}", but the auth client's own "${key}" answers at authClient.${key}.`,
      );
    },
  );
});
