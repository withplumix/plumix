import { describe, expect, it } from "vitest";

import type { EntryAccessSubject } from "../access/contract/access-key.js";
import type { AppContext, AuthenticatedUser } from "../context/app-context.js";
import type { EntryTypeAccess } from "../plugin/manifest.js";
import { anonymousContext } from "../access/anonymous-context.js";
import { ACCESS_POLICY_META_KEY } from "../access/contract/meta-key.js";
import {
  anonymousPolicy,
  authenticatedPolicy,
  challenge,
  definePolicy,
  grant,
  redirectToLogin,
} from "../access/policy.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { createTestContext } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import { entryPolicyAdmits } from "./entry-access.js";

/**
 * Types are registered through a plugin so their derived `entry:<type>:*`
 * capabilities exist: a signed-in asker really holds them, and the anonymous
 * answer must not depend on that.
 */
async function ctx(args: {
  user?: AuthenticatedUser | null;
  entryTypes?: Readonly<Record<string, EntryTypeAccess | undefined>>;
}): Promise<AppContext> {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [
      definePlugin("entry-access-test", {
        setup: (setup) => {
          for (const [name, access] of Object.entries(args.entryTypes ?? {})) {
            setup.registerEntryType(name, {
              label: name,
              isPublic: true,
              access,
            });
          }
        },
      }),
    ],
  });
  return createTestContext({
    db: await createTestDb(),
    plugins: registry,
    user: args.user ?? null,
  });
}

/** What a shared, publicly cached artefact may say about the entry. */
function admitsAnonymously(
  c: AppContext,
  entry: EntryAccessSubject,
): Promise<boolean> {
  return entryPolicyAdmits(anonymousContext(c), entry, "listing");
}

describe("entryPolicyAdmits asked through anonymousContext", () => {
  const admin: AuthenticatedUser = {
    id: 1,
    email: "admin@example.test",
    name: null,
    role: "admin",
    meta: {},
  };

  const withType = (access: EntryTypeAccess | undefined) => ({
    column: access,
  });

  const memberSpace: EntryTypeAccess = {
    default: anonymousPolicy,
    policies: [
      { key: "members", label: "Members only", policy: authenticatedPolicy },
    ],
  };

  it("allows an entry whose type declares no access at all", async () => {
    const c = await ctx({ entryTypes: withType(undefined) });
    await expect(admitsAnonymously(c, { type: "column" })).resolves.toBe(true);
  });

  it("allows an entry of a type nothing registered", async () => {
    // No policy is attached to a type that isn't there. Whether such an entry
    // has a page at all is the caller's question, not this one.
    const c = await ctx({});
    await expect(admitsAnonymously(c, { type: "ghost" })).resolves.toBe(true);
  });

  it("refuses an entry whose type default gates anonymous visitors", async () => {
    const c = await ctx({
      entryTypes: withType({ default: authenticatedPolicy }),
    });
    await expect(admitsAnonymously(c, { type: "column" })).resolves.toBe(false);
  });

  it("refuses an entry that selected a gating policy of its own", async () => {
    const c = await ctx({ entryTypes: withType(memberSpace) });
    await expect(
      admitsAnonymously(c, {
        type: "column",
        meta: { [ACCESS_POLICY_META_KEY]: "members" },
      }),
    ).resolves.toBe(false);
  });

  it("allows a sibling entry that selected nothing", async () => {
    const c = await ctx({ entryTypes: withType(memberSpace) });
    await expect(
      admitsAnonymously(c, { type: "column", meta: {} }),
    ).resolves.toBe(true);
  });

  it("answers the same for a signed-in asker as for a scraper", async () => {
    // The artefact is fetched by a scraper carrying no session, so an admin
    // viewing the page must not be told a gated entry is shareable.
    const c = await ctx({
      user: admin,
      entryTypes: withType({ default: authenticatedPolicy }),
    });
    await expect(admitsAnonymously(c, { type: "column" })).resolves.toBe(false);
  });

  it("drops the asker's capabilities, not just their identity", async () => {
    // A resolver reading `ctx.auth.can()` rather than `ctx.user` must see the
    // anonymous answer too, or an admin's privileges leak into the decision.
    const c = await ctx({
      user: admin,
      entryTypes: withType({
        default: definePolicy({
          resolve: (inner) =>
            inner.auth.can("entry:column:read")
              ? grant("anonymous")
              : redirectToLogin(),
        }),
      }),
    });
    await expect(admitsAnonymously(c, { type: "column" })).resolves.toBe(false);
  });

  it("allows an entry behind a soft challenge", async () => {
    const c = await ctx({
      entryTypes: withType({
        default: definePolicy({
          resolve: () => challenge("subscribe", { soft: true }),
        }),
      }),
    });
    await expect(admitsAnonymously(c, { type: "column" })).resolves.toBe(true);
  });

  it("refuses an entry behind a hard challenge", async () => {
    const c = await ctx({
      entryTypes: withType({
        default: definePolicy({ resolve: () => challenge("forbidden") }),
      }),
    });
    await expect(admitsAnonymously(c, { type: "column" })).resolves.toBe(false);
  });
});

describe("entryPolicyAdmits within one request", () => {
  it("refuses a type whose policy refuses the reader after a granting type was asked", async () => {
    const c = await ctx({
      entryTypes: {
        open: { default: anonymousPolicy },
        closed: { default: authenticatedPolicy },
      },
    });
    await entryPolicyAdmits(c, { type: "open" }, "listing");

    await expect(
      entryPolicyAdmits(c, { type: "closed" }, "listing"),
    ).resolves.toBe(false);
  });
});
