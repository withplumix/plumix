import { describe, expect, it } from "vitest";

import type { AppContext, AuthenticatedUser } from "../context/app.js";
import type { UserRole } from "../db/schema/users.js";
import {
  AccessError,
  anonymousPolicy,
  authenticatedPolicy,
  challenge,
  definePolicy,
  grant,
  isBuiltinSegment,
  principalSegment,
  redirectToLogin,
  resolveAccess,
  rolePolicy,
} from "./policy.js";

function user(
  role: UserRole,
  meta: Record<string, unknown> = {},
): AuthenticatedUser {
  return { id: 1, email: "u@site.test", name: null, role, meta };
}

// The pure resolver only ever reads the principal off `ctx`; a narrow stub is
// all the built-in policies touch.
function ctx(u: AuthenticatedUser | null): AppContext {
  return { user: u } as unknown as AppContext;
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
});

describe("segment helpers", () => {
  it("recognizes the built-in segments", () => {
    expect(isBuiltinSegment("anonymous")).toBe(true);
    expect(isBuiltinSegment("authenticated")).toBe(true);
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
