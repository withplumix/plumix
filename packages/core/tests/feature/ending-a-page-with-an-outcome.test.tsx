import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AppContext } from "../../src/context/app-context.js";
import type { ArchiveTypeData } from "../../src/route/contract/resolved-entry.js";
import { createPreviewToken } from "../../src/auth/preview-token.js";
import { defineBlock } from "../../src/blocks/index.js";
import { BlockRenderer } from "../../src/blocks/renderer/index.js";
import { getContext } from "../../src/context/stores.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  pageNotFound,
  redirectTo,
} from "../../src/route/contract/page-outcome.js";
import {
  entry,
  entryType,
  fallback,
  forArchiveType,
  notFound,
} from "../../src/route/render/template-builders.js";
import { defineTemplate } from "../../src/template.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

interface LoginPageData extends ArchiveTypeData {
  readonly kind: "archiveType";
  readonly name: "login-page";
}
declare module "../../src/template-registry.js" {
  interface ArchiveTypeRegistry {
    "login-page": { data: LoginPageData };
  }
}

declare module "../../src/blocks/deps.js" {
  interface TemplateDepRegistry {
    "share-cursor": { slug: string; result: string };
  }
}

/**
 * `/login` sends a signed-in visitor home, and `?to=` sends anyone elsewhere
 * with the status it names.
 */
const loginPlugin = definePlugin("login-page", {
  setup: (ctx) => {
    ctx.registerArchiveType("login-page", {
      routes: ["/login"],
      cacheable: true,
      resolve: (appCtx) => {
        const url = new URL(appCtx.request.url);
        const to = url.searchParams.get("to");
        if (to !== null) {
          throw redirectTo(to, Number(url.searchParams.get("status")) as 308);
        }
        if (url.searchParams.has("gone")) throw pageNotFound();
        if (appCtx.user !== null) throw redirectTo("/");
        return {
          data: { kind: "archiveType", name: "login-page" },
          title: "Sign in",
        };
      },
    });
  },
});

const loginTheme = defineTheme({
  templates: [
    forArchiveType("login-page").template(() => <h1>Sign in</h1>),
    fallback(() => null),
  ],
});

const loginSite = await testSite({
  plugins: [loginPlugin],
  config: { theme: loginTheme },
});

const login404Site = await testSite({
  plugins: [loginPlugin],
  config: {
    theme: defineTheme({
      templates: [notFound(() => <h1>Nothing here</h1>), fallback(() => null)],
    }),
  },
});

const membersPlugin = definePlugin("members", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerArchiveType("members", {
      routes: ["/members"],
      entries: (q) => q.ofTypes("post"),
      title: "Members",
      resolve: (appCtx: AppContext) => {
        if (appCtx.user === null) throw redirectTo("/login", 307);
        return {};
      },
    });
  },
});

const membersSite = await testSite({
  plugins: [membersPlugin],
  config: { theme: defineTheme({ templates: [fallback(() => null)] }) },
});

describe("an archive resolve that throws an outcome", () => {
  test("redirectTo sends a signed-in visitor on with a 302 nothing stores", async () => {
    const page = await loginSite.actingAs("member").visit("/login");

    page
      .assertStatus(302)
      .assertRedirect("/")
      .assertHeader("cache-control", "private, no-store");
    loginSite.cdn.assertNotStored("/login");
  });

  test("redirectTo answers with the status it names, kept by no cache", async () => {
    const page = await loginSite.visit("/login?to=/x&status=308");

    page
      .assertStatus(308)
      .assertRedirect("/x")
      .assertHeader("cache-control", "private, no-store");
    loginSite.cdn.assertNotStored("/login?to=/x&status=308");
  });

  test("pageNotFound answers the theme's 404 page", async () => {
    const page = await login404Site.visit("/login?gone", {
      headers: { accept: "text/html" },
    });

    page.assertNotFound().assertSee("<h1>Nothing here</h1>");
  });

  test("a listed archive's resolve is honoured too", async () => {
    const page = await membersSite.visit("/members");

    page.assertStatus(307).assertRedirect("/login");
  });

  test("an anonymous visitor gets the page", async () => {
    const page = await loginSite.visit("/login");

    page.assertOk().assertSee("<h1>Sign in</h1>");
  });
});

/**
 * A share page: its block's loader looks the share up by the `share` attr,
 * and what it finds decides the page.
 */
const sharePlugin = definePlugin("share", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerBlock(
      defineBlock({
        name: "acme/share",
        loaders: {
          share: ({ attrs }: { readonly attrs: Record<string, unknown> }) => {
            if (attrs.share === "unknown") throw pageNotFound();
            if (attrs.share === "spent") throw redirectTo("/elsewhere");
            if (attrs.share === "broken") throw new Error("share store down");
            if (attrs.share === "mixed") throw new Error("share store down");
            return Promise.resolve(`share ${String(attrs.share)}`);
          },
          // Declared after `share`, so a block's first rejection is not its
          // outcome.
          audit: ({ attrs }: { readonly attrs: Record<string, unknown> }) => {
            if (attrs.share === "mixed") throw pageNotFound();
            return Promise.resolve("audited");
          },
        },
        errorFallback: () => <p>share unavailable</p>,
        render: ({ loaders }) => <p>{loaders.share}</p>,
      }),
    );
  },
});

const shareTheme = defineTheme({
  templates: [
    notFound(() => <h1>Nothing here</h1>),
    entry(({ data }) =>
      data.entry.contentBlocks ? (
        <BlockRenderer content={data.entry.contentBlocks} />
      ) : null,
    ),
    fallback(() => null),
  ],
});

/** A published post at `/post/shared` whose share block looks up `share`. */
function sharedPost(share: string) {
  return {
    type: "post",
    slug: "shared",
    title: "Shared",
    content: {
      version: "plumix.v2",
      blocks: [{ id: "s", name: "acme/share", attrs: { share } }],
    },
  } as const;
}

const html = { headers: { accept: "text/html" } };

const shareSite = await testSite({
  plugins: [sharePlugin],
  config: { theme: shareTheme },
});

// The dev runtime is built only when the gate is on as the app boots.
vi.stubEnv("PLUMIX_DEV", "1");
const shareDevSite = await testSite({
  plugins: [sharePlugin],
  config: { theme: shareTheme },
});
vi.unstubAllEnvs();

describe("a block loader on the entry that throws an outcome", () => {
  test("pageNotFound answers the theme's 404 page", async () => {
    await shareSite.factory.published.create(sharedPost("unknown"));

    const page = await shareSite.visit("/post/shared", html);

    page.assertNotFound().assertSee("<h1>Nothing here</h1>");
  });

  describe("with the dev gate on", () => {
    beforeEach(() => {
      vi.stubEnv("PLUMIX_DEV", "1");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    test("pageNotFound is still a 404, not the dev error page", async () => {
      await shareDevSite.factory.published.create(sharedPost("unknown"));

      const page = await shareDevSite.visit("/post/shared", html);

      page.assertNotFound().assertSee("<h1>Nothing here</h1>");
    });
  });

  test("redirectTo answers 302 to the location", async () => {
    await shareSite.factory.published.create(sharedPost("spent"));

    const page = await shareSite.visit("/post/shared");

    page.assertStatus(302).assertRedirect("/elsewhere");
  });

  test("a ?preview= render honours it", async () => {
    const shared = await shareSite.factory.published.create(
      sharedPost("spent"),
    );
    const token = await createPreviewToken(shareSite.context.db, {
      entryId: shared.id,
      userId: shared.authorId,
    });

    const page = await shareSite.visit(`/post/shared?preview=${token}`);

    page.assertStatus(302).assertRedirect("/elsewhere");
  });

  test("pageNotFound still ends the page when an earlier loader on the block failed", async () => {
    await shareSite.factory.published.create(sharedPost("mixed"));

    const page = await shareSite.visit("/post/shared", html);

    page.assertNotFound();
  });

  test("an ordinary error stays the block's own", async () => {
    await shareSite.factory.published.create(sharedPost("broken"));

    const page = await shareSite.visit("/post/shared");

    page.assertOk().assertSee("share unavailable");
  });
});

const listingSite = await testSite({
  plugins: [sharePlugin],
  config: {
    theme: defineTheme({
      templates: [
        entryType(
          defineTemplate({
            prefetchArchiveLoaders: true,
            render: ({ data }) => (
              <ul>
                {data.entries.map((listed) =>
                  listed.contentBlocks ? (
                    <li key={listed.id}>
                      <BlockRenderer content={listed.contentBlocks} />
                    </li>
                  ) : null,
                )}
              </ul>
            ),
          }),
        ),
        fallback(() => null),
      ],
    }),
  },
});

describe("an outcome thrown where it is not honoured", () => {
  test("on an archive listing it is the listed entry's block error", async () => {
    await listingSite.factory.published.create(sharedPost("unknown"));

    const page = await listingSite.visit("/post");

    page.assertOk().assertSee("share unavailable");
  });

  test("in the editor it is the block's error, so the page stays editable", async () => {
    const author = await shareSite.factory.user.create({ role: "admin" });
    await shareSite.factory.published.create({
      ...sharedPost("spent"),
      authorId: author.id,
    });

    const page = await shareSite
      .actingAs(author)
      .visit("/post/shared?plumix.edit");

    page.assertOk().assertSee("share unavailable");
  });
});

const cursorDocument = vi.fn(() => ({ title: "Shared" }));
const cursorPlugin = definePlugin("cursor", {
  setup: (ctx) => {
    ctx.registerTemplateDep("share-cursor", {
      keyedBy: "slug",
      load: () => Promise.reject(redirectTo("/x", 301)),
    });
  },
});
const cursorSite = await testSite({
  plugins: [sharePlugin, cursorPlugin],
  config: {
    theme: defineTheme({
      templates: [
        entry(
          defineTemplate({
            "share-cursor": ["current"],
            document: cursorDocument,
            render: () => null,
          }),
        ),
        fallback(() => null),
      ],
    }),
  },
});

const documentNotFoundSite = await testSite({
  plugins: [sharePlugin],
  config: {
    theme: defineTheme({
      templates: [
        notFound(() => <h1>Nothing here</h1>),
        entry(
          defineTemplate({
            document: () => {
              throw pageNotFound();
            },
            render: () => null,
          }),
        ),
        fallback(() => null),
      ],
    }),
  },
});

describe("the template's own steps", () => {
  test("a template dep throwing redirectTo answers before document() runs", async () => {
    await cursorSite.factory.published.create(sharedPost("known"));

    const page = await cursorSite.visit("/post/shared");

    page.assertStatus(301).assertRedirect("/x");
    expect(cursorDocument).not.toHaveBeenCalled();
  });

  test("document() throwing pageNotFound answers the theme's 404 page", async () => {
    await documentNotFoundSite.factory.published.create(sharedPost("known"));

    const page = await documentNotFoundSite.visit("/post/shared", html);

    page.assertNotFound().assertSee("<h1>Nothing here</h1>");
  });
});

const lookup = vi.fn((token: string) =>
  Promise.resolve({ title: `Share ${token}` }),
);
/** The memoized function both sides call: one lookup per request, typed. */
const findShare = (ctx: AppContext) => {
  const token = new URL(ctx.request.url).searchParams.get("token") ?? "";
  return ctx.memo(`share:${token}`, () => lookup(token));
};
const tokenPlugin = definePlugin("token", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerBlock(
      defineBlock({
        name: "acme/share",
        loaders: { share: () => findShare(getContext()) },
        render: ({ loaders }) => <p>{loaders.share.title}</p>,
      }),
    );
  },
});
const tokenSite = await testSite({
  plugins: [tokenPlugin],
  config: {
    theme: defineTheme({
      templates: [
        entry(
          defineTemplate({
            document: async ({ ctx }) => ({
              title: (await findShare(ctx)).title,
            }),
            render: ({ data }) =>
              data.entry.contentBlocks ? (
                <BlockRenderer content={data.entry.contentBlocks} />
              ) : null,
          }),
        ),
        fallback(() => null),
      ],
    }),
  },
});

describe("the head reads what a loader found through ctx.memo", () => {
  test("the loader and document() share one lookup per request", async () => {
    await tokenSite.factory.published.create(sharedPost("known"));

    const page = await tokenSite.visit("/post/shared?token=abc");

    page.assertSee("<title>Share abc</title>");
    expect(lookup).toHaveBeenCalledOnce();
  });
});

/**
 * What a second copy's `redirectTo("/copy", 307)` builds: its own error,
 * branded with the same registered symbol.
 */
const fromCopy = Object.assign(new Error("from a copy"), {
  [Symbol.for("plumix.pageOutcome")]: true,
  kind: "redirect",
  location: "/copy",
  status: 307,
});
const copyPlugin = definePlugin("copy", {
  setup: (ctx) => {
    ctx.registerArchiveType("login-page", {
      routes: ["/login"],
      resolve: () => {
        throw fromCopy;
      },
    });
  },
});
const copySite = await testSite({
  plugins: [copyPlugin],
  config: { theme: loginTheme },
});

test("an outcome a separately bundled copy of the module made is recognised", async () => {
  const page = await copySite.visit("/login");

  page.assertStatus(307).assertRedirect("/copy");
});
