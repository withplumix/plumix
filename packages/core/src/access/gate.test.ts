import { describe, expect, it } from "vitest";

import type { AppContext, AuthenticatedUser } from "../context/app.js";
import type { EntryTypeAccess } from "../plugin/manifest.js";
import type { RouteMatch } from "../route/match.js";
import { gateToResponse, policyForMatch, selectEntryPolicy } from "./gate.js";
import { ACCESS_POLICY_META_KEY } from "./meta-key.js";
import { anonymousPolicy, authenticatedPolicy, rolePolicy } from "./policy.js";

type RequestMemoStub = <T>(key: string, load: () => Promise<T>) => Promise<T>;

// A memo pre-seeded with `single-entry:*` rows keyed exactly as
// `resolveSingleEntry` computes them. A hit replays the seeded row (its
// `load` never runs); a miss loads live — no `resolveSingleEntry` under test
// here reaches the DB because every single-intent case seeds its key.
function seededMemo(
  rows: Record<string, { meta: Record<string, unknown> } | null>,
): RequestMemoStub {
  return <T>(key: string, load: () => Promise<T>): Promise<T> =>
    key in rows ? Promise.resolve(rows[key] as T) : load();
}

function ctx(args: {
  user?: AuthenticatedUser | null;
  basePath?: string;
  entryTypes?: Map<string, unknown>;
  archiveTypes?: Map<string, unknown>;
  memo?: RequestMemoStub;
}): AppContext {
  return {
    user: args.user ?? null,
    basePath: args.basePath ?? "",
    memo: args.memo ?? (<T>(_k: string, load: () => Promise<T>) => load()),
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

const matchWith = (
  intent: RouteMatch["intent"],
  params: Record<string, string>,
): RouteMatch => ({ intent, params });

// Narrow a gate result to a Response — a redirect/challenge case asserts it
// short-circuited rather than allowed the render through.
function must(response: Response | null): Response {
  if (response === null) throw new Error("expected a gate response");
  return response;
}

describe("selectEntryPolicy", () => {
  const editors = rolePolicy("editor");
  const access: EntryTypeAccess = {
    default: anonymousPolicy,
    policies: [
      { key: "members", label: "Members only", policy: authenticatedPolicy },
      { key: "staff", label: "Staff only", policy: editors },
    ],
  };

  it("falls back to the default when no key is stored", () => {
    expect(selectEntryPolicy(access, undefined)).toBe(anonymousPolicy);
  });

  it("returns the policy whose key the entry selected", () => {
    expect(selectEntryPolicy(access, "members")).toBe(authenticatedPolicy);
    expect(selectEntryPolicy(access, "staff")).toBe(editors);
  });

  it("falls back to the default for a key outside the declared space", () => {
    // A stale / removed selection must never grant less than the type default.
    expect(selectEntryPolicy(access, "ghost")).toBe(anonymousPolicy);
  });

  it("falls back to the default when the type declares no policies", () => {
    expect(selectEntryPolicy({ default: authenticatedPolicy }, "members")).toBe(
      authenticatedPolicy,
    );
  });
});

describe("policyForMatch", () => {
  it("returns the entry type's default policy for a single intent", async () => {
    const c = ctx({
      entryTypes: new Map([
        ["post", { access: { default: authenticatedPolicy } }],
      ]),
    });
    await expect(
      policyForMatch(c, match({ kind: "single", entryType: "post" })),
    ).resolves.toBe(authenticatedPolicy);
  });

  it("gates a type's archive route with the same default policy", async () => {
    const c = ctx({
      entryTypes: new Map([
        ["post", { access: { default: authenticatedPolicy } }],
      ]),
    });
    await expect(
      policyForMatch(c, match({ kind: "archive", entryType: "post" })),
    ).resolves.toBe(authenticatedPolicy);
  });

  it("resolves a single intent's per-entry choice over the type default", async () => {
    const editors = rolePolicy("editor");
    const c = ctx({
      entryTypes: new Map([
        [
          "post",
          {
            access: {
              default: anonymousPolicy,
              policies: [{ key: "staff", label: "Staff", policy: editors }],
            },
          },
        ],
      ]),
      // The addressed entry stores `staff` under the reserved access key.
      memo: seededMemo({
        "single-entry:post:s:hello": {
          meta: { [ACCESS_POLICY_META_KEY]: "staff" },
        },
      }),
    });
    await expect(
      policyForMatch(
        c,
        matchWith({ kind: "single", entryType: "post" }, { slug: "hello" }),
      ),
    ).resolves.toBe(editors);
  });

  it("falls back to the type default for a per-entry-space single with no stored choice", async () => {
    const c = ctx({
      entryTypes: new Map([
        [
          "post",
          {
            access: {
              default: authenticatedPolicy,
              policies: [
                { key: "staff", label: "Staff", policy: rolePolicy("editor") },
              ],
            },
          },
        ],
      ]),
      memo: seededMemo({ "single-entry:post:s:hello": { meta: {} } }),
    });
    await expect(
      policyForMatch(
        c,
        matchWith({ kind: "single", entryType: "post" }, { slug: "hello" }),
      ),
    ).resolves.toBe(authenticatedPolicy);
  });

  it("falls back to the type default when the single entry is a would-be-404", async () => {
    const c = ctx({
      entryTypes: new Map([
        [
          "post",
          {
            access: {
              default: authenticatedPolicy,
              policies: [
                { key: "staff", label: "Staff", policy: rolePolicy("editor") },
              ],
            },
          },
        ],
      ]),
      // No matching entry — the resolver memoizes `null`, so the type default
      // gates even a slug that doesn't exist (no existence leak).
      memo: seededMemo({ "single-entry:post:s:ghost": null }),
    });
    await expect(
      policyForMatch(
        c,
        matchWith({ kind: "single", entryType: "post" }, { slug: "ghost" }),
      ),
    ).resolves.toBe(authenticatedPolicy);
  });

  it("returns null for an entry type with no access declared", async () => {
    const c = ctx({ entryTypes: new Map([["post", {}]]) });
    await expect(
      policyForMatch(c, match({ kind: "single", entryType: "post" })),
    ).resolves.toBe(null);
  });

  it("returns the route-level policy for a custom archive", async () => {
    const c = ctx({
      archiveTypes: new Map([["events", { access: authenticatedPolicy }]]),
    });
    await expect(
      policyForMatch(c, match({ kind: "custom", name: "events" })),
    ).resolves.toBe(authenticatedPolicy);
  });

  it("returns null for un-policied intents and an unmatched route", async () => {
    const c = ctx({});
    await expect(
      policyForMatch(c, match({ kind: "front-page" })),
    ).resolves.toBe(null);
    await expect(
      policyForMatch(c, match({ kind: "taxonomy", taxonomy: "cat" })),
    ).resolves.toBe(null);
    await expect(policyForMatch(c, match({ kind: "search" }))).resolves.toBe(
      null,
    );
    await expect(policyForMatch(c, null)).resolves.toBe(null);
  });
});

describe("gateToResponse", () => {
  const url = new URL("https://site.test/members/secret?x=1");
  const login = "/_plumix/admin/login";

  it("lets an allow gate proceed (no short-circuit response)", () => {
    expect(
      gateToResponse(
        { type: "allow" },
        { ctx: ctx({}), url, loginPath: login },
      ),
    ).toBe(null);
  });

  it("redirects a `redirect` gate to sign-in with a returnTo", () => {
    const response = must(
      gateToResponse(
        { type: "redirect" },
        { ctx: ctx({}), url, loginPath: login },
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?redirectTo=%2Fmembers%2Fsecret%3Fx%3D1",
    );
    // The per-visitor 302 must never be stored by an intermediary.
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("prefixes both the login path and the returnTo with the base path", () => {
    const response = must(
      gateToResponse(
        { type: "redirect" },
        { ctx: ctx({ basePath: "/blog" }), url, loginPath: "/login" },
      ),
    );
    expect(response.headers.get("location")).toBe(
      "/blog/login?redirectTo=%2Fblog%2Fmembers%2Fsecret%3Fx%3D1",
    );
  });

  it("answers a `forbidden` challenge with a terminal 403", () => {
    const response = must(
      gateToResponse(
        { type: "challenge", kind: "forbidden" },
        { ctx: ctx({}), url, loginPath: login },
      ),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("x-plumix-challenge")).toBe("forbidden");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers a paywall challenge with a 402", () => {
    const response = must(
      gateToResponse(
        { type: "challenge", kind: "subscribe" },
        { ctx: ctx({}), url, loginPath: login },
      ),
    );
    expect(response.status).toBe(402);
    expect(response.headers.get("x-plumix-challenge")).toBe("subscribe");
  });

  it("lets a soft challenge proceed (renders a teaser, no short-circuit)", () => {
    // The soft gate never blocks: the dispatcher renders the teaser variant at
    // 200 instead of a terminal response.
    expect(
      gateToResponse(
        { type: "challenge", kind: "subscribe", soft: true },
        { ctx: ctx({}), url, loginPath: login },
      ),
    ).toBe(null);
  });
});
