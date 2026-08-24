import { describe, expect, it } from "vitest";

import type { AppContext, AuthenticatedUser } from "../context/app.js";
import type { UserRole } from "../db/schema/users.js";
import type { JsonObject } from "../json.js";
import {
  AccessError,
  anonymousPolicy,
  authenticatedPolicy,
  challenge,
  definePolicy,
  entitlement,
  entitlementSegment,
  grant,
  isBuiltinSegment,
  principalSegment,
  redirectToLogin,
  resolveAccess,
  rolePolicy,
} from "./policy.js";

function user(role: UserRole, meta: JsonObject = {}): AuthenticatedUser {
  return { id: 1, email: "u@site.test", name: null, role, meta };
}

// The pure resolver only ever reads the principal off `ctx`; a narrow stub is
// all the built-in policies touch.
function ctx(u: AuthenticatedUser | null): AppContext {
  return { user: u } as unknown as AppContext;
}

// A stub with a real per-request memo — the read-through the entitlement
// resolvers exercise. Runs each `load` once per key, replaying the settled
// value to later callers, exactly as the request-scoped memo does.
function memoCtx(u: AuthenticatedUser | null): AppContext {
  const store = new Map<string, Promise<unknown>>();
  const memo = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const existing = store.get(key);
    if (existing) return existing as Promise<T>;
    const pending = load();
    store.set(key, pending);
    return pending;
  };
  return { user: u, memo } as unknown as AppContext;
}

describe("definePolicy", () => {
  it("defaults the declared segment space to empty", () => {
    const policy = definePolicy({ resolve: () => grant("anonymous") });
    expect(policy.segments).toEqual([]);
  });

  it("keeps the declared custom segment space", () => {
    const policy = definePolicy({
      segments: ["members"],
      resolve: () => grant("members"),
    });
    expect(policy.segments).toEqual(["members"]);
  });
});

describe("resolveAccess — built-in policies", () => {
  it("grants everyone the anonymous segment under the default policy", async () => {
    await expect(resolveAccess(ctx(null), anonymousPolicy)).resolves.toEqual({
      segment: "anonymous",
      gate: { type: "allow" },
    });
    await expect(
      resolveAccess(ctx(user("subscriber")), anonymousPolicy),
    ).resolves.toEqual({ segment: "anonymous", gate: { type: "allow" } });
  });

  it("lets any authenticated principal through the authenticated policy", async () => {
    await expect(
      resolveAccess(ctx(user("subscriber")), authenticatedPolicy),
    ).resolves.toEqual({ segment: "authenticated", gate: { type: "allow" } });
  });

  it("redirects an anonymous visitor to sign-in under the authenticated policy", async () => {
    await expect(
      resolveAccess(ctx(null), authenticatedPolicy),
    ).resolves.toEqual({ segment: "anonymous", gate: { type: "redirect" } });
  });

  it("grants a sufficiently-privileged principal the required role segment", async () => {
    // An admin meets an `editor` gate; the segment is the required audience
    // tier (`role:editor`), not the principal's own role, so every
    // sufficiently-privileged visitor shares one variant.
    await expect(
      resolveAccess(ctx(user("admin")), rolePolicy("editor")),
    ).resolves.toEqual({ segment: "role:editor", gate: { type: "allow" } });
  });

  it("denies an under-privileged principal at a role gate", async () => {
    await expect(
      resolveAccess(ctx(user("subscriber")), rolePolicy("editor")),
    ).resolves.toEqual({
      segment: "authenticated",
      gate: { type: "challenge", kind: "forbidden" },
    });
  });

  it("redirects an anonymous visitor at a role gate", async () => {
    await expect(
      resolveAccess(ctx(null), rolePolicy("editor")),
    ).resolves.toEqual({ segment: "anonymous", gate: { type: "redirect" } });
  });
});

describe("resolveAccess — custom resolvers (open logic, closed output)", () => {
  it("grants a declared custom segment", async () => {
    const membersOnly = definePolicy({
      segments: ["members"],
      resolve: (c) => (c.user ? grant("members") : redirectToLogin()),
    });
    await expect(
      resolveAccess(ctx(user("subscriber")), membersOnly),
    ).resolves.toEqual({ segment: "members", gate: { type: "allow" } });
  });

  it("awaits an async (I/O-bearing) resolver", async () => {
    const membersOnly = definePolicy({
      segments: ["members"],
      resolve: async (c) => {
        await Promise.resolve();
        return c.user?.meta.active === true
          ? grant("members")
          : challenge("subscribe");
      },
    });
    await expect(
      resolveAccess(ctx(user("subscriber", { active: true })), membersOnly),
    ).resolves.toEqual({ segment: "members", gate: { type: "allow" } });
    await expect(
      resolveAccess(ctx(user("subscriber", { active: false })), membersOnly),
    ).resolves.toEqual({
      segment: "authenticated",
      gate: { type: "challenge", kind: "subscribe" },
    });
  });

  it("rejects a grant of a segment outside the policy's declared space", async () => {
    const policy = definePolicy({
      segments: ["members"],
      resolve: () => grant("vip"),
    });
    await expect(
      resolveAccess(ctx(user("subscriber")), policy),
    ).rejects.toThrow(AccessError);
  });

  it("allows a grant of any built-in segment without declaring it", async () => {
    const policy = definePolicy({ resolve: () => grant("authenticated") });
    await expect(resolveAccess(ctx(user("author")), policy)).resolves.toEqual({
      segment: "authenticated",
      gate: { type: "allow" },
    });
  });

  it("grants the `private` escape-hatch segment without declaring it", async () => {
    // `private` is a built-in: a policy that gates but keeps the render
    // per-visitor grants it, and it must resolve without a `segments` entry.
    const policy = definePolicy({
      resolve: (c) => (c.user ? grant("private") : redirectToLogin()),
    });
    await expect(
      resolveAccess(ctx(user("subscriber")), policy),
    ).resolves.toEqual({ segment: "private", gate: { type: "allow" } });
  });
});

describe("resolveAccess — entitlement segments (paywall / membership)", () => {
  // A paywall policy: an active entitlement gets the full render under a shared
  // `entitlement:premium` segment; everyone else (anon or lapsed) gets a soft
  // challenge — the teaser, at their own segment.
  const paywall = definePolicy({
    segments: [entitlementSegment("premium")],
    resolve: async (c) => {
      // The entitlement check may be async and memoized per request — here it
      // reads through `ctx.memo`, running the (stubbed) lookup once per key.
      const active = await c.memo(`entitlement:${c.user?.id ?? 0}`, async () =>
        Promise.resolve(c.user?.meta.premium === true),
      );
      return active
        ? entitlement("premium")
        : challenge("subscribe", { soft: true });
    },
  });

  it("grants an active entitlement the shared entitlement segment (full render)", async () => {
    await expect(
      resolveAccess(memoCtx(user("subscriber", { premium: true })), paywall),
    ).resolves.toEqual({
      segment: "entitlement:premium",
      gate: { type: "allow" },
    });
  });

  it("soft-challenges a lapsed principal at their own segment (teaser variant)", async () => {
    // Two un-entitled visitors of the same kind share one teaser variant: a
    // lapsed subscriber caches under `authenticated`, an anonymous bot under
    // `anonymous` — both distinct from the entitled `entitlement:premium`.
    await expect(
      resolveAccess(memoCtx(user("subscriber", { premium: false })), paywall),
    ).resolves.toEqual({
      segment: "authenticated",
      gate: { type: "challenge", kind: "subscribe", soft: true },
    });
    await expect(resolveAccess(memoCtx(null), paywall)).resolves.toEqual({
      segment: "anonymous",
      gate: { type: "challenge", kind: "subscribe", soft: true },
    });
  });

  it("memoizes the entitlement check within a request", async () => {
    let lookups = 0;
    const ctx = memoCtx(user("subscriber", { premium: true }));
    const policy = definePolicy({
      segments: [entitlementSegment("premium")],
      resolve: (c) =>
        c
          .memo("premium", async () => {
            lookups += 1;
            return Promise.resolve(true);
          })
          .then((ok) =>
            ok
              ? entitlement("premium")
              : challenge("subscribe", { soft: true }),
          ),
    });
    await resolveAccess(ctx, policy);
    await resolveAccess(ctx, policy);
    // Both resolutions share the same request-scoped memo → one lookup.
    expect(lookups).toBe(1);
  });

  it("rejects an undeclared entitlement label", async () => {
    const policy = definePolicy({
      // Only `premium` is declared; the resolver grants `pro`.
      segments: [entitlementSegment("premium")],
      resolve: () => entitlement("pro"),
    });
    await expect(
      resolveAccess(memoCtx(user("subscriber")), policy),
    ).rejects.toThrow(AccessError);
  });
});

describe("challenge — hard vs soft", () => {
  it("is hard by default (no soft flag)", () => {
    expect(challenge("subscribe")).toEqual({
      type: "challenge",
      kind: "subscribe",
    });
  });

  it("carries the soft flag when opted in", () => {
    expect(challenge("subscribe", { soft: true })).toEqual({
      type: "challenge",
      kind: "subscribe",
      soft: true,
    });
  });

  it("keeps a hard challenge gate flag-free through resolution", async () => {
    const policy = definePolicy({ resolve: () => challenge("forbidden") });
    const { gate } = await resolveAccess(memoCtx(user("subscriber")), policy);
    expect(gate).toEqual({ type: "challenge", kind: "forbidden" });
  });
});

describe("entitlementSegment", () => {
  it("builds the `entitlement:<label>` string", () => {
    expect(entitlementSegment("premium")).toBe("entitlement:premium");
  });
});

describe("segment helpers", () => {
  it("recognizes the built-in segments", () => {
    expect(isBuiltinSegment("anonymous")).toBe(true);
    expect(isBuiltinSegment("authenticated")).toBe(true);
    expect(isBuiltinSegment("private")).toBe(true);
    expect(isBuiltinSegment("role:admin")).toBe(true);
    expect(isBuiltinSegment("role:subscriber")).toBe(true);
  });

  it("rejects unknown roles and custom labels", () => {
    expect(isBuiltinSegment("role:wizard")).toBe(false);
    expect(isBuiltinSegment("members")).toBe(false);
    expect(isBuiltinSegment("entitlement:pro")).toBe(false);
  });

  it("derives the free built-in segment from the principal", () => {
    expect(principalSegment(null)).toBe("anonymous");
    expect(principalSegment(user("editor"))).toBe("authenticated");
  });
});
