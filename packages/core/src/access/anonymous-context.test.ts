import { describe, expect, test } from "vitest";

import type { PrincipalPolicy } from "../auth/principal.js";
import type { AppContext } from "../context/app-context.js";
import { principalOf, resolvePrincipal } from "../auth/principal.js";
import { withUser } from "../auth/with-user.js";
import {
  declaredPageTags,
  declarePageTags,
} from "../cdn/contract/page-tags.js";
import { asc } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { publicEntryRows } from "../entries/visibility.js";
import { defineEvent, defineFilter } from "../events-and-filters/define.js";
import { HandlerRegistry } from "../events-and-filters/registry.js";
import { settings } from "../events-and-filters/settings.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { createTestContext } from "../test/context.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { buildRequest } from "../test/request.js";
import { anonymousContext } from "./anonymous-context.js";
import { CORE_CAPABILITIES } from "./contract/capability.js";
import { ACCESS_POLICY_META_KEY } from "./contract/meta-key.js";
import {
  anonymousPolicy,
  authenticatedPolicy,
  resolveAccess,
} from "./policy.js";

const pagesWithAccess = definePlugin("pages-with-access", {
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      access: {
        default: anonymousPolicy,
        policies: [
          { key: "members", label: "Members", policy: authenticatedPolicy },
        ],
      },
    });
  },
});

async function editorContext() {
  const db = await createTestDb();
  const { registry } = await installPlugins({
    handlers: new HandlerRegistry(),
    plugins: [pagesWithAccess],
  });
  const factory = factoriesFor(db);
  const editor = await factory.user.create({ role: "editor" });
  for (const [slug, meta] of [
    ["public-page", {}],
    ["members-page", { [ACCESS_POLICY_META_KEY]: "members" }],
  ] as const) {
    await factory.entry.create({
      type: "page",
      status: "published",
      publishedAt: new Date(),
      authorId: editor.id,
      slug,
      meta,
    });
  }
  return createTestContext({ db, plugins: registry, user: editor });
}

async function listedSlugs(ctx: AppContext): Promise<string[]> {
  const clause = await publicEntryRows(ctx);
  if (clause === null) return [];
  const rows = await ctx.db
    .select({ slug: entries.slug })
    .from(entries)
    .where(clause)
    .orderBy(asc(entries.id));
  return rows.map((row) => row.slug);
}

/** Signed in by cookie, not yet resolved: what a dispatched request carries. */
async function sessionRequestContext(
  handlers = new HandlerRegistry(),
): Promise<AppContext> {
  const ctx = await editorContext();
  const editor = await factoriesFor(ctx.db).user.create({ role: "editor" });
  const request = await buildRequest(ctx.db, "https://cms.example/", {
    as: editor,
  });
  return createTestContext({
    db: ctx.db,
    plugins: ctx.plugins,
    request,
    handlers,
  });
}

const POLICIES: readonly PrincipalPolicy[] = [
  { kind: "configured" },
  { kind: "session" },
  { kind: "session-gated" },
];

function principalFields(ctx: AppContext) {
  const { user, tokenScopes, apiToken, credential, auth } = ctx;
  return { user, tokenScopes, apiToken, credential, auth };
}

describe("anonymousContext", () => {
  test("publicEntryRows asked through it leaves out members entries whoever is signed in", async () => {
    const ctx = await editorContext();

    const slugs = await listedSlugs(anonymousContext(ctx));

    expect(slugs).toEqual(["public-page"]);
  });

  test("carries no principal and holds no capability", async () => {
    const ctx = await editorContext();

    const anonymous = anonymousContext(ctx);

    expect(anonymous.user).toBeNull();
    expect(anonymous.tokenScopes).toBeNull();
    expect(anonymous.auth.can("entry:page:read")).toBe(false);
    expect(anonymous.db).toBe(ctx.db);
    expect(anonymous.plugins).toBe(ctx.plugins);
  });

  test.each(POLICIES)(
    "resolves nobody under the $kind policy, though the request carries a session",
    async (policy) => {
      const ctx = await sessionRequestContext();

      const resolved = await resolvePrincipal(anonymousContext(ctx), policy);

      expect(resolved).toBeNull();
      expect((await resolvePrincipal(ctx, policy))?.user.id).toBeDefined();
    },
  );

  test("reports no session to a reader asking its authenticator", async () => {
    const ctx = await sessionRequestContext();
    const { authenticator, request } = anonymousContext(ctx);

    expect(authenticator.hasSession?.(request)).toBe(false);
    expect(
      await authenticator.authenticate(request, ctx.db, {
        startingUserMeta: {},
      }),
    ).toBeNull();
  });

  test("a context spread from it still reaches its handlers as nobody", async () => {
    const pinged = defineEvent<null>("test:pinged");
    const labelled = defineFilter<string>("test:labelled", { sync: false });
    const heard: (boolean | undefined)[] = [];
    const handlers = new HandlerRegistry();
    const record = (appCtx: AppContext): void => {
      heard.push(appCtx.authenticator.hasSession?.(appCtx.request));
    };
    handlers.on(settings.groupChanged, (_changes, appCtx) => record(appCtx));
    handlers.on(pinged, (_payload, appCtx) => record(appCtx));
    handlers.add(labelled, (value, _input, appCtx) => {
      record(appCtx);
      return value;
    });
    const derived = {
      ...anonymousContext(await sessionRequestContext(handlers)),
    };

    await derived.settings.write("notes", { body: "A" });
    await derived.events.emit(pinged, null);
    await derived.filters.apply(labelled, "label");

    expect(heard).toEqual([false, false, false]);
    expect(await resolvePrincipal(derived, { kind: "configured" })).toBeNull();
  });

  test("holds the principal of a request no one is signed in to", async () => {
    const ctx = await editorContext();
    const signedOut = createTestContext({ db: ctx.db, plugins: ctx.plugins });

    expect(principalFields(anonymousContext(ctx))).toEqual(
      principalFields(signedOut),
    );
  });

  test("holds no capability the site knows, even from an admin's request", async () => {
    const ctx = await editorContext();
    const admin = await factoriesFor(ctx.db).user.create({ role: "admin" });
    const adminCtx = withUser(ctx, principalOf(admin), { kind: "session" });
    const known = [
      ...Object.keys(CORE_CAPABILITIES),
      ...ctx.plugins.capabilities.keys(),
    ];

    const anonymous = anonymousContext(adminCtx);

    expect(known.filter((name) => anonymous.auth.can(name))).toEqual([]);
    expect(known.every((name) => adminCtx.auth.can(name))).toBe(true);
  });

  test("is sent to sign-in by a policy that wants a signed-in user", async () => {
    const anonymous = anonymousContext(await editorContext());

    const access = await resolveAccess(anonymous, authenticatedPolicy);

    expect(access.gate).toEqual({ type: "redirect" });
  });

  test("drops the API token the request authenticated with", async () => {
    const ctx = await editorContext();
    if (!ctx.user) throw new Error("expected an editor");
    const tokenCtx = withUser(ctx, ctx.user, {
      kind: "api-token",
      token: { id: "token-hash", name: "Claude Desktop" },
      scopes: null,
    });

    expect(anonymousContext(tokenCtx).apiToken).toBeNull();
    // A spread is how a context is derived, so the copy must carry it too.
    expect({ ...anonymousContext(tokenCtx) }.credential).toBeNull();
  });

  test("keeps its memo entries apart from the request's", async () => {
    const ctx = await editorContext();
    await ctx.memo("test:who", () => Promise.resolve("editor"));

    const seen = await anonymousContext(ctx).memo("test:who", () =>
      Promise.resolve("anonymous"),
    );

    expect(seen).toBe("anonymous");
  });

  test("drops its memo entry when a write invalidates the entry's tag", async () => {
    const anonymous = anonymousContext(await editorContext());
    await anonymous.memo("test:title", () => Promise.resolve("before"), [
      "entry:1",
    ]);

    anonymous.memo.invalidate(["entry:1"]);
    const seen = await anonymous.memo("test:title", () =>
      Promise.resolve("after"),
    );

    expect(seen).toBe("after");
  });

  test("keeps two keys memoed through it as two entries", async () => {
    const anonymous = anonymousContext(await editorContext());
    await anonymous.memo("test:one", () => Promise.resolve("one"));

    const seen = await anonymous.memo("test:two", () => Promise.resolve("two"));

    expect(seen).toBe("two");
  });

  test("stores the request's response under a tag declared through it", async () => {
    const ctx = await editorContext();

    declarePageTags(anonymousContext(ctx), ["read-by-the-reader"]);

    expect(declaredPageTags(ctx)).toEqual(["read-by-the-reader"]);
  });

  test("stores the request's response under a tag declared through it twice over", async () => {
    const ctx = await editorContext();

    declarePageTags(anonymousContext(anonymousContext(ctx)), ["listed"]);

    expect(declaredPageTags(ctx)).toEqual(["listed"]);
  });
});
