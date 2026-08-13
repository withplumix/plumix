import { describe, expect, test } from "vitest";

import type { CustomArchiveData } from "../route/render/resolved-entry.js";
import { definePlugin } from "../plugin/define.js";
import { fallback, forArchiveType } from "../route/render/template-builders.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import { authenticatedPolicy, rolePolicy } from "./policy.js";

// Two custom archives standing in for policied public routes: one
// authenticated-only, one gated to `editor`. The route-level `access` policy is
// the seam under test end-to-end.
interface GatedData extends CustomArchiveData {
  readonly kind: "custom";
  readonly name: "members" | "staff";
  readonly label: string;
}
declare module "../template-registry.js" {
  interface ArchiveTypeRegistry {
    members: { data: GatedData };
    staff: { data: GatedData };
  }
}

const gatedPlugin = definePlugin("gated", (ctx) => {
  ctx.registerArchiveType("members", {
    routes: ["/members"],
    access: authenticatedPolicy,
    resolve: () => ({
      data: { kind: "custom", name: "members", label: "members-area" },
      title: "Members",
    }),
  });
  ctx.registerArchiveType("staff", {
    routes: ["/staff"],
    access: rolePolicy("editor"),
    resolve: () => ({
      data: { kind: "custom", name: "staff", label: "staff-area" },
      title: "Staff",
    }),
  });
});

const gatedTheme = defineTheme({
  templates: [
    forArchiveType("members").template(({ data }) => (
      <main>
        <h1 data-testid="members">{data.label}</h1>
      </main>
    )),
    forArchiveType("staff").template(({ data }) => (
      <main>
        <h1 data-testid="staff">{data.label}</h1>
      </main>
    )),
    fallback(() => null),
  ],
});

describe("access gate — hard gate through the dispatcher", () => {
  test("redirects an anonymous visitor to sign-in with a returnTo", async () => {
    const h = await createDispatcherHarness({
      plugins: [gatedPlugin],
      theme: gatedTheme,
    });
    const response = await h.dispatch(
      new Request("https://cms.example/members?ref=nav"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?redirectTo=%2Fmembers%3Fref%3Dnav",
    );
  });

  test("renders the protected route for an authenticated visitor", async () => {
    const h = await createDispatcherHarness({
      plugins: [gatedPlugin],
      theme: gatedTheme,
    });
    const subscriber = await h.seedUser("subscriber");
    const response = await h.dispatch(
      new Request("https://cms.example/members"),
      subscriber,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-testid="members"');
  });

  test("denies an under-privileged visitor at a role gate with a 403", async () => {
    const h = await createDispatcherHarness({
      plugins: [gatedPlugin],
      theme: gatedTheme,
    });
    const subscriber = await h.seedUser("subscriber");
    const response = await h.dispatch(
      new Request("https://cms.example/staff"),
      subscriber,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("x-plumix-challenge")).toBe("forbidden");
  });

  test("admits a sufficiently-privileged visitor at a role gate", async () => {
    const h = await createDispatcherHarness({
      plugins: [gatedPlugin],
      theme: gatedTheme,
    });
    const editor = await h.seedUser("editor");
    const response = await h.dispatch(
      new Request("https://cms.example/staff"),
      editor,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-testid="staff"');
  });

  test("leaves an un-policied route untouched", async () => {
    const h = await createDispatcherHarness({
      plugins: [gatedPlugin],
      theme: gatedTheme,
    });
    // The front page carries no policy — anonymous, no redirect.
    const response = await h.dispatch(new Request("https://cms.example/"));
    expect(response.status).not.toBe(302);
  });
});

// An entry type carrying an `access.default` gates its single (and archive)
// routes end-to-end — proving the policy survives registration and the
// single/archive intent branch of `policyForMatch` fires through the real
// dispatcher, not just a stubbed registry.
const articlesPlugin = definePlugin("articles", (ctx) => {
  ctx.registerEntryType("article", {
    label: "Articles",
    isPublic: true,
    access: { default: authenticatedPolicy },
  });
});

describe("access gate — entry-type-level policy", () => {
  async function seedArticle(
    h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  ) {
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "article",
      slug: "gated",
      title: "Gated Article",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: null,
    });
  }

  test("redirects an anonymous visitor away from a gated entry's single route", async () => {
    const h = await createDispatcherHarness({ plugins: [articlesPlugin] });
    await seedArticle(h);
    const response = await h.dispatch(
      new Request("https://cms.example/article/gated"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?redirectTo=%2Farticle%2Fgated",
    );
  });

  test("renders the gated entry for an authenticated visitor", async () => {
    const h = await createDispatcherHarness({ plugins: [articlesPlugin] });
    await seedArticle(h);
    const subscriber = await h.seedUser("subscriber");
    const response = await h.dispatch(
      new Request("https://cms.example/article/gated"),
      subscriber,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Gated Article");
    // A policied render is kept out of every cache in this slice.
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
