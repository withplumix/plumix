import { afterEach, describe, expect, test, vi } from "vitest";

import type { AppContext } from "../context/app-context.js";
import type { CdnStore, ConnectedCdn } from "../runtime/contract/slots.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import type { ArchiveTypeData } from "./contract/resolved-entry.js";
import { defineBlock } from "../blocks/index.js";
import { BlockRenderer } from "../blocks/renderer/index.js";
import { getContext } from "../context/stores.js";
import { definePlugin } from "../plugin/define.js";
import { defineTemplate } from "../template.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import { pageNotFound, redirectTo } from "./contract/page-outcome.js";
import {
  entry,
  entryType,
  fallback,
  forArchiveType,
  notFound,
} from "./render/template-builders.js";

interface LoginPageData extends ArchiveTypeData {
  readonly kind: "archiveType";
  readonly name: "login-page";
}
declare module "../template-registry.js" {
  interface ArchiveTypeRegistry {
    "login-page": { data: LoginPageData };
  }
}

declare module "../template.js" {
  interface TemplateDepRegistry {
    "share-cursor": { slug: string; result: string };
  }
}

// A CDN whose store records every write, so a test can assert nothing landed.
function recordingCdn() {
  const put = vi.fn<CdnStore["put"]>(() => Promise.resolve());
  const cdn: ConnectedCdn = {
    decorate: (response) => response,
    store: { match: () => Promise.resolve(undefined), put },
  };
  return { cdn, put };
}

// `/login` sends a signed-in visitor home, and `?to=` sends anyone elsewhere
// with the status it names.
const loginPlugin = definePlugin("login-page", (ctx) => {
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
});

const loginTheme = defineTheme({
  templates: [
    forArchiveType("login-page").template(() => <h1>Sign in</h1>),
    fallback(() => null),
  ],
});

describe("an archive resolve that throws an outcome", () => {
  test("redirectTo sends a signed-in visitor on with a 302 nothing stores", async () => {
    const { cdn, put } = recordingCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [loginPlugin], theme: loginTheme },
    });
    const user = await h.seedUser("subscriber");

    const response = await h.dispatch(
      await h.authenticateRequest(
        new Request("https://cms.example/login"),
        user.id,
      ),
    );
    await h.drainDeferred();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(put).not.toHaveBeenCalled();
  });

  test("redirectTo answers with the status it names, kept by no cache", async () => {
    const { cdn, put } = recordingCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [loginPlugin], theme: loginTheme },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/login?to=/x&status=308"),
    );
    await h.drainDeferred();

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/x");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(put).not.toHaveBeenCalled();
  });

  test("pageNotFound answers the theme's 404 page", async () => {
    const h = await createDispatcherHarness({
      config: {
        plugins: [loginPlugin],
        theme: defineTheme({
          templates: [
            notFound(() => <h1>Nothing here</h1>),
            fallback(() => null),
          ],
        }),
      },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/login?gone", {
        headers: { accept: "text/html" },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<h1>Nothing here</h1>");
  });

  test("a listed archive's resolve is honoured too", async () => {
    const membersPlugin = definePlugin("members", (ctx) => {
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
    });
    const h = await createDispatcherHarness({
      config: {
        plugins: [membersPlugin],
        theme: defineTheme({ templates: [fallback(() => null)] }),
      },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/members"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/login");
  });

  test("an anonymous visitor gets the page", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [loginPlugin], theme: loginTheme },
    });

    const response = await h.dispatch(new Request("https://cms.example/login"));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>Sign in</h1>");
  });
});

// A share page: its block's loader looks the share up by the `share` attr,
// and what it finds decides the page.
const sharePlugin = definePlugin("share", (ctx) => {
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
        // Declared after `share`, so a block's first rejection is not its outcome.
        audit: ({ attrs }: { readonly attrs: Record<string, unknown> }) => {
          if (attrs.share === "mixed") throw pageNotFound();
          return Promise.resolve("audited");
        },
      },
      errorFallback: () => <p>share unavailable</p>,
      render: ({ loaders }) => <p>{loaders.share}</p>,
    }),
  );
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

async function seedShare(
  h: DispatcherHarness,
  share: string,
): Promise<{ readonly authorId: number; readonly entryId: number }> {
  const author = await h.seedUser("admin");
  const created = await h.factory.entry.create({
    type: "post",
    slug: "shared",
    title: "Shared",
    content: {
      version: "plumix.v2",
      blocks: [{ id: "s", name: "acme/share", attrs: { share } }],
    },
    status: "published",
    authorId: author.id,
    publishedAt: new Date(),
  });
  return { authorId: author.id, entryId: created.id };
}

const html = { headers: { accept: "text/html" } };

describe("a block loader on the entry that throws an outcome", () => {
  test("pageNotFound answers the theme's 404 page", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [sharePlugin], theme: shareTheme },
    });
    await seedShare(h, "unknown");

    const response = await h.dispatch(
      new Request("https://cms.example/post/shared", html),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<h1>Nothing here</h1>");
  });

  describe("with the dev gate on", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    test("pageNotFound is still a 404, not the dev error page", async () => {
      vi.stubEnv("PLUMIX_DEV", "1");
      const h = await createDispatcherHarness({
        config: { plugins: [sharePlugin], theme: shareTheme },
      });
      await seedShare(h, "unknown");

      const response = await h.dispatch(
        new Request("https://cms.example/post/shared", html),
      );

      expect(response.status).toBe(404);
      expect(await response.text()).toContain("<h1>Nothing here</h1>");
    });
  });

  test("redirectTo answers 302 to the location", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [sharePlugin], theme: shareTheme },
    });
    await seedShare(h, "spent");

    const response = await h.dispatch(
      new Request("https://cms.example/post/shared"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/elsewhere");
  });

  test("a ?preview= render honours it", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [sharePlugin], theme: shareTheme },
    });
    const { authorId, entryId } = await seedShare(h, "spent");
    const token = await h.mintPreviewToken({ entryId, userId: authorId });

    const response = await h.dispatch(
      new Request(`https://cms.example/post/shared?preview=${token}`),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/elsewhere");
  });

  test("pageNotFound still ends the page when an earlier loader on the block failed", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [sharePlugin], theme: shareTheme },
    });
    await seedShare(h, "mixed");

    const response = await h.dispatch(
      new Request("https://cms.example/post/shared", html),
    );

    expect(response.status).toBe(404);
  });

  test("an ordinary error stays the block's own", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [sharePlugin], theme: shareTheme },
    });
    await seedShare(h, "broken");

    const response = await h.dispatch(
      new Request("https://cms.example/post/shared"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("share unavailable");
  });
});

describe("an outcome thrown where it is not honoured", () => {
  test("on an archive listing it is the listed entry's block error", async () => {
    const h = await createDispatcherHarness({
      config: {
        plugins: [sharePlugin],
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
    await seedShare(h, "unknown");

    const response = await h.dispatch(new Request("https://cms.example/post"));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("share unavailable");
  });

  test("in the editor it is the block's error, so the page stays editable", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [sharePlugin], theme: shareTheme },
    });
    const { authorId } = await seedShare(h, "spent");

    const response = await h.dispatch(
      await h.authenticateRequest(
        new Request("https://cms.example/post/shared?plumix.edit"),
        authorId,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("share unavailable");
  });
});

describe("the template's own steps", () => {
  test("a template dep throwing redirectTo answers before document() runs", async () => {
    const document = vi.fn(() => ({ title: "Shared" }));
    const cursorPlugin = definePlugin("cursor", (ctx) => {
      ctx.registerTemplateDep("share-cursor", {
        keyedBy: "slug",
        load: () => Promise.reject(redirectTo("/x", 301)),
      });
    });
    const h = await createDispatcherHarness({
      config: {
        plugins: [sharePlugin, cursorPlugin],
        theme: defineTheme({
          templates: [
            entry(
              defineTemplate({
                "share-cursor": ["current"],
                document,
                render: () => null,
              }),
            ),
            fallback(() => null),
          ],
        }),
      },
    });
    await seedShare(h, "known");

    const response = await h.dispatch(
      new Request("https://cms.example/post/shared"),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/x");
    expect(document).not.toHaveBeenCalled();
  });

  test("document() throwing pageNotFound answers the theme's 404 page", async () => {
    const h = await createDispatcherHarness({
      config: {
        plugins: [sharePlugin],
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
    await seedShare(h, "known");

    const response = await h.dispatch(
      new Request("https://cms.example/post/shared", html),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<h1>Nothing here</h1>");
  });

  test("a dep on the 404 template that throws an outcome leaves the 404 page standing", async () => {
    const cursorPlugin = definePlugin("cursor", (ctx) => {
      ctx.registerTemplateDep("share-cursor", {
        keyedBy: "slug",
        load: () => Promise.reject(redirectTo("/x", 301)),
      });
    });
    const h = await createDispatcherHarness({
      config: {
        plugins: [sharePlugin, cursorPlugin],
        theme: defineTheme({
          templates: [
            notFound(
              defineTemplate({
                "share-cursor": ["current"],
                render: () => <h1>Nothing here</h1>,
              }),
            ),
            entry(
              ({ data }) =>
                data.entry.contentBlocks && (
                  <BlockRenderer content={data.entry.contentBlocks} />
                ),
            ),
            fallback(() => null),
          ],
        }),
      },
    });
    await seedShare(h, "unknown");

    const response = await h.dispatch(
      new Request("https://cms.example/post/shared", html),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<h1>Nothing here</h1>");
  });
});

describe("the head reads what a loader found through ctx.memo", () => {
  test("the loader and document() share one lookup per request", async () => {
    const lookup = vi.fn((token: string) =>
      Promise.resolve({ title: `Share ${token}` }),
    );
    // The memoized function both sides call: one lookup per request, typed.
    const findShare = (ctx: AppContext) => {
      const token = new URL(ctx.request.url).searchParams.get("token") ?? "";
      return ctx.memo(`share:${token}`, () => lookup(token));
    };
    const tokenPlugin = definePlugin("token", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerBlock(
        defineBlock({
          name: "acme/share",
          loaders: { share: () => findShare(getContext()) },
          render: ({ loaders }) => <p>{loaders.share.title}</p>,
        }),
      );
    });
    const h = await createDispatcherHarness({
      config: {
        plugins: [tokenPlugin],
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
    await seedShare(h, "known");

    const response = await h.dispatch(
      new Request("https://cms.example/post/shared?token=abc"),
    );

    expect(await response.text()).toContain("<title>Share abc</title>");
    expect(lookup).toHaveBeenCalledOnce();
  });
});

test("an outcome a separately bundled copy of the module made is recognised", async () => {
  // What a second copy's `redirectTo("/copy", 307)` builds: its own error,
  // branded with the same registered symbol.
  const fromCopy = Object.assign(new Error("from a copy"), {
    [Symbol.for("plumix.pageOutcome")]: true,
    kind: "redirect",
    location: "/copy",
    status: 307,
  });
  const copyPlugin = definePlugin("copy", (ctx) => {
    ctx.registerArchiveType("login-page", {
      routes: ["/login"],
      resolve: () => {
        throw fromCopy;
      },
    });
  });
  const h = await createDispatcherHarness({
    config: { plugins: [copyPlugin], theme: loginTheme },
  });

  const response = await h.dispatch(new Request("https://cms.example/login"));

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/copy");
});
