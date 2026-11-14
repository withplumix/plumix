import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import { CORE_CAPABILITIES } from "../access/contract/capability.js";
import { authenticatedPolicy, resolveAccess } from "../access/policy.js";
import { principalOf } from "../auth/principal.js";
import { withUser } from "../auth/with-user.js";
import { HandlerRegistry } from "../events-and-filters/registry.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { createTestContext } from "../test/context.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { resolveRestPrincipal } from "./principal.js";

const pages = definePlugin("pages", {
  setup: (ctx) => {
    ctx.registerEntryType("page", { label: "Pages", isPublic: true });
  },
});

async function anonymousRestContext(): Promise<AppContext> {
  const { registry } = await installPlugins({
    handlers: new HandlerRegistry(),
    plugins: [pages],
  });
  const ctx = createTestContext({
    db: await createTestDb(),
    plugins: registry,
  });
  const principal = await resolveRestPrincipal(ctx);
  if (principal.kind !== "anonymous") throw new Error("expected anonymous");
  return principal.ctx;
}

describe("an anonymous REST request", () => {
  test("holds exactly the member role's capabilities", async () => {
    const ctx = await anonymousRestContext();
    const known = [
      ...Object.keys(CORE_CAPABILITIES),
      ...ctx.plugins.capabilities.keys(),
    ];

    const held = known.filter((capability) => ctx.auth.can(capability));

    expect(held.sort()).toEqual([
      "entry:page:read",
      "entry:post:read",
      "user:edit_own",
    ]);
  });

  test("holds the anonymous principal even from a signed-in context", async () => {
    const db = await createTestDb();
    const editor = await factoriesFor(db).user.create({ role: "editor" });
    const signedIn = withUser(createTestContext({ db }), principalOf(editor), {
      kind: "session",
      sessionId: "session-1",
    });

    const principal = await resolveRestPrincipal(signedIn);
    if (principal.kind !== "anonymous") throw new Error("expected anonymous");

    expect(principal.ctx.user).toBeNull();
    expect(principal.ctx.credential).toBeNull();
    expect(principal.ctx.apiToken).toBeNull();
    expect(principal.ctx.tokenScopes).toBeNull();
  });

  test("is sent to sign-in by a policy that wants a signed-in user", async () => {
    const ctx = await anonymousRestContext();

    const access = await resolveAccess(ctx, authenticatedPolicy);

    expect(access.gate).toEqual({ type: "redirect" });
  });
});
