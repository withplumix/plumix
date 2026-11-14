import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import {
  entryCapability,
  termCapability,
} from "../access/contract/capability.js";
import { definePlugin } from "../plugin/define.js";
import { testSite } from "../test/site.js";
import { withUser } from "./with-user.js";

// `auth.can()` is the single gate every capability check goes through, so
// a refactor must not strip the tokenScopes intersection.

const site = await testSite({ plugins: [] });

/**
 * `news` pools its permissions with `post`, so `entry:post:*` reaches news
 * rows and `entry:news:*` is never minted.
 */
const pooled = await testSite({
  plugins: [
    definePlugin("site", {
      setup: (ctx) => {
        ctx.registerEntryType("post", { label: "Posts" });
        ctx.registerEntryType("news", {
          label: "News",
          capabilityType: "post",
        });
      },
    }),
  ],
});

const tagged = await testSite({
  plugins: [
    definePlugin("site", {
      setup: (ctx) => {
        ctx.registerCapability("term:tag:assign", {
          grantTo: ["author", "editor"],
        });
      },
    }),
  ],
});

function buildCtx(args: {
  role: "member" | "author" | "editor" | "admin";
  /** Absent signs in with a session; present, with a token of these scopes. */
  tokenScopes?: readonly string[];
  on?: { readonly context: AppContext };
}) {
  return withUser(
    (args.on ?? site).context,
    { id: 1, email: "u@cms.example", role: args.role, meta: {} },
    args.tokenScopes === undefined
      ? { kind: "session" }
      : {
          kind: "api-token",
          token: { id: "token-hash", name: "ci" },
          scopes: args.tokenScopes,
        },
  );
}

describe("auth.can — tokenScopes narrowing", () => {
  test("session-style auth (tokenScopes null) inherits role caps verbatim", () => {
    const ctx = buildCtx({ role: "editor" });
    expect(ctx.auth.can("entry:post:edit_any")).toBe(true);
    expect(ctx.auth.can("settings:manage")).toBe(false); // editor < admin
  });

  test("scoped token narrows to the intersection (cap in scope + role grants)", () => {
    const ctx = buildCtx({
      role: "editor",
      tokenScopes: ["entry:post:read"],
    });
    // In scope AND role grants: allowed.
    expect(ctx.auth.can("entry:post:read")).toBe(true);
    // Role would grant, but cap not in scope: denied.
    expect(ctx.auth.can("entry:post:edit_any")).toBe(false);
  });

  test("scoped token can't escalate beyond the role's caps", () => {
    const ctx = buildCtx({
      role: "member",
      tokenScopes: ["settings:manage", "user:delete"],
    });
    // Token claims `settings:manage` but the role doesn't grant it.
    expect(ctx.auth.can("settings:manage")).toBe(false);
    expect(ctx.auth.can("user:delete")).toBe(false);
  });

  test("empty scopes array means no caps", () => {
    const ctx = buildCtx({ role: "admin", tokenScopes: [] });
    expect(ctx.auth.can("entry:post:read")).toBe(false);
    expect(ctx.auth.can("settings:manage")).toBe(false);
  });

  test("unauthenticated context can never grant a capability", () => {
    expect(site.context.auth.can("entry:post:read")).toBe(false);
  });
});

describe("auth.can — capability references", () => {
  test("resolves an entry reference to the namespace its type pools under", () => {
    const ctx = buildCtx({
      role: "editor",
      on: pooled,
    });
    expect(ctx.auth.can(entryCapability("news", "edit_any"))).toBe(true);
    expect(ctx.auth.can("entry:news:edit_any")).toBe(false);
  });

  test("narrows a reference by the token scope its resolved string names", () => {
    const ctx = buildCtx({
      role: "editor",
      tokenScopes: ["entry:post:read"],
      on: pooled,
    });
    expect(ctx.auth.can(entryCapability("news", "read"))).toBe(true);
    expect(ctx.auth.can(entryCapability("news", "edit_any"))).toBe(false);
  });

  test("resolves a term reference under its taxonomy", () => {
    const ctx = buildCtx({ role: "author", on: tagged });
    expect(ctx.auth.can(termCapability("tag", "assign"))).toBe(true);
  });
});
