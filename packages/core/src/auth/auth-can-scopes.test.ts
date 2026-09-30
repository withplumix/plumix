import { describe, expect, test } from "vitest";

import type { PluginRegistry } from "../plugin/registry.js";
import type { createTestDb } from "../test/harness.js";
import {
  entryCapability,
  termCapability,
} from "../access/contract/capability.js";
import { createAppContext } from "../context/app.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { testConfig } from "../test/config.js";
import { pooledEntryTypeRegistry } from "../test/pooled-entry-types.js";
import { withUser } from "./with-user.js";

// `auth.can()` is the single gate every capability check goes through —
// settings RPC, entry RPC, plugin route handlers all consult it. These
// tests pin its tokenScopes-narrowing behaviour so a future refactor
// can't silently strip the intersection.

function buildCtx(args: {
  role: "subscriber" | "contributor" | "author" | "editor" | "admin";
  tokenScopes?: readonly string[] | null;
  plugins?: PluginRegistry;
}) {
  const db = {} as Awaited<ReturnType<typeof createTestDb>>;
  const hooks = new HookRegistry();
  const plugins = args.plugins ?? createPluginRegistry();
  const baseCtx = createAppContext({
    db,
    env: {},
    request: new Request("https://cms.example/"),
    config: testConfig(),
    hooks,
    plugins,
  });
  return withUser(
    baseCtx,
    { id: 1, email: "u@cms.example", role: args.role, meta: {} },
    args.tokenScopes ?? null,
  );
}

describe("auth.can — tokenScopes narrowing", () => {
  test("session-style auth (tokenScopes null) inherits role caps verbatim", () => {
    const ctx = buildCtx({ role: "editor", tokenScopes: null });
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
      role: "subscriber",
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
    const db = {} as Awaited<ReturnType<typeof createTestDb>>;
    const hooks = new HookRegistry();
    const plugins = createPluginRegistry();
    const ctx = createAppContext({
      db,
      env: {},
      request: new Request("https://cms.example/"),
      config: testConfig(),
      hooks,
      plugins,
    });
    expect(ctx.auth.can("entry:post:read")).toBe(false);
  });
});

describe("auth.can — capability references", () => {
  test("resolves an entry reference to the namespace its type pools under", async () => {
    const ctx = buildCtx({
      role: "editor",
      plugins: await pooledEntryTypeRegistry(),
    });
    expect(ctx.auth.can(entryCapability("news", "edit_any"))).toBe(true);
    expect(ctx.auth.can("entry:news:edit_any")).toBe(false);
  });

  test("narrows a reference by the token scope its resolved string names", async () => {
    const ctx = buildCtx({
      role: "editor",
      tokenScopes: ["entry:post:read"],
      plugins: await pooledEntryTypeRegistry(),
    });
    expect(ctx.auth.can(entryCapability("news", "read"))).toBe(true);
    expect(ctx.auth.can(entryCapability("news", "edit_any"))).toBe(false);
  });

  test("resolves a term reference under its taxonomy", () => {
    const plugins = createPluginRegistry();
    plugins.capabilities.set("term:tag:assign", {
      name: "term:tag:assign",
      minRole: "contributor",
      registeredBy: null,
    });
    const ctx = buildCtx({ role: "contributor", plugins });
    expect(ctx.auth.can(termCapability("tag", "assign"))).toBe(true);
  });
});
