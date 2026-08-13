import { describe, expect, it } from "vitest";

import type { AppContext, AuthenticatedUser } from "../context/app.js";
import type { UserRole } from "../db/schema/users.js";
import type { RouteMatch } from "../route/match.js";
import { enforceAccess, policyForMatch } from "./gate.js";
import {
  anonymousPolicy,
  authenticatedPolicy,
  challenge,
  definePolicy,
  rolePolicy,
} from "./policy.js";

function user(role: UserRole): AuthenticatedUser {
  return { id: 1, email: "u@site.test", name: null, role, meta: {} };
}

function ctx(args: {
  user?: AuthenticatedUser | null;
  basePath?: string;
  entryTypes?: Map<string, unknown>;
  archiveTypes?: Map<string, unknown>;
}): AppContext {
  return {
    user: args.user ?? null,
    basePath: args.basePath ?? "",
    plugins: {
      entryTypes: args.entryTypes ?? new Map(),
      archiveTypes: args.archiveTypes ?? new Map(),
    },
  } as unknown as AppContext;
}

const match = (intent: RouteMatch["intent"]): RouteMatch => ({
  intent,
  params: {},
});

// Narrow a gate result to a Response — a redirect/challenge case asserts it
// short-circuited rather than allowed the render through.
function must(response: Response | null): Response {
  if (response === null) throw new Error("expected a gate response");
  return response;
}

describe("policyForMatch", () => {
  it("returns the entry type's default policy for a single intent", () => {
    const c = ctx({
      entryTypes: new Map([
        ["post", { access: { default: authenticatedPolicy } }],
      ]),
    });
    expect(
      policyForMatch(c, match({ kind: "single", entryType: "post" })),
    ).toBe(authenticatedPolicy);
  });

  it("gates a type's archive route with the same default policy", () => {
    const c = ctx({
      entryTypes: new Map([
        ["post", { access: { default: authenticatedPolicy } }],
      ]),
    });
    expect(
      policyForMatch(c, match({ kind: "archive", entryType: "post" })),
    ).toBe(authenticatedPolicy);
  });

  it("returns null for an entry type with no access declared", () => {
    const c = ctx({ entryTypes: new Map([["post", {}]]) });
    expect(
      policyForMatch(c, match({ kind: "single", entryType: "post" })),
    ).toBe(null);
  });

  it("returns the route-level policy for a custom archive", () => {
    const c = ctx({
      archiveTypes: new Map([["events", { access: authenticatedPolicy }]]),
    });
    expect(policyForMatch(c, match({ kind: "custom", name: "events" }))).toBe(
      authenticatedPolicy,
    );
  });

  it("returns null for un-policied intents and an unmatched route", () => {
    const c = ctx({});
    expect(policyForMatch(c, match({ kind: "front-page" }))).toBe(null);
    expect(
      policyForMatch(c, match({ kind: "taxonomy", taxonomy: "cat" })),
    ).toBe(null);
    expect(policyForMatch(c, match({ kind: "search" }))).toBe(null);
    expect(policyForMatch(c, null)).toBe(null);
  });
});

describe("enforceAccess", () => {
  const url = new URL("https://site.test/members/secret?x=1");

  it("lets an allowed principal proceed (no short-circuit response)", async () => {
    await expect(
      enforceAccess({
        ctx: ctx({ user: user("subscriber") }),
        url,
        policy: anonymousPolicy,
        loginPath: "/_plumix/admin/login",
      }),
    ).resolves.toBe(null);
  });

  it("redirects an anonymous visitor to sign-in with a returnTo", async () => {
    const response = must(
      await enforceAccess({
        ctx: ctx({ user: null }),
        url,
        policy: authenticatedPolicy,
        loginPath: "/_plumix/admin/login",
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?redirectTo=%2Fmembers%2Fsecret%3Fx%3D1",
    );
  });

  it("prefixes both the login path and the returnTo with the base path", async () => {
    const response = must(
      await enforceAccess({
        ctx: ctx({ user: null, basePath: "/blog" }),
        url,
        policy: authenticatedPolicy,
        loginPath: "/login",
      }),
    );
    expect(response.headers.get("location")).toBe(
      "/blog/login?redirectTo=%2Fblog%2Fmembers%2Fsecret%3Fx%3D1",
    );
  });

  it("denies an under-privileged principal with a terminal 403 challenge", async () => {
    const response = must(
      await enforceAccess({
        ctx: ctx({ user: user("subscriber") }),
        url,
        policy: rolePolicy("editor"),
        loginPath: "/_plumix/admin/login",
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("x-plumix-challenge")).toBe("forbidden");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers a paywall challenge with a 402", async () => {
    const membersOnly = definePolicy({
      segments: ["members"],
      resolve: () => challenge("subscribe"),
    });
    const response = must(
      await enforceAccess({
        ctx: ctx({ user: user("subscriber") }),
        url,
        policy: membersOnly,
        loginPath: "/_plumix/admin/login",
      }),
    );
    expect(response.status).toBe(402);
    expect(response.headers.get("x-plumix-challenge")).toBe("subscribe");
  });
});
