import { beforeEach, describe, expect, test } from "vitest";

import type { JsonObject } from "../../src/json.js";
import { ACCESS_POLICY_META_KEY } from "../../src/access/contract/meta-key.js";
import {
  anonymousPolicy,
  challenge,
  definePolicy,
  grant,
} from "../../src/access/policy.js";
import { UNIVERSAL_COPY_HEADER } from "../../src/cdn/universal-copy.js";
import { definePlugin } from "../../src/plugin/define.js";
import { entry, fallback } from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

let renders = 0;

const pages = definePlugin("pages", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      access: {
        default: anonymousPolicy,
        policies: [
          {
            key: "teaser",
            label: "Teaser",
            policy: definePolicy({
              resolve: (c) =>
                c.user
                  ? grant("authenticated")
                  : challenge("paywall", { soft: true }),
            }),
          },
        ],
      },
    });
  },
});

const theme = defineTheme({
  templates: [
    fallback(() => null),
    entry(({ data }) => {
      renders += 1;
      return <article>{data.entry.title}</article>;
    }),
  ],
});

/**
 * A member who saved German reads the public site in it; the request alone
 * resolves to English.
 */
const savedLocale = {
  defaultLocale: "en",
  locales: ["en", "de"],
  resolveLocale: (_request: Request, user: { meta: JsonObject } | null) =>
    user?.meta.locale === "de"
      ? {
          code: "de",
          label: "German",
          direction: "ltr" as const,
          enabled: true,
        }
      : null,
};

const site = await testSite({
  plugins: [pages],
  config: { theme, i18n: savedLocale },
});

beforeEach(() => {
  renders = 0;
});

async function publish(type: "post" | "page", meta: JsonObject = {}) {
  const author = await site.factory.admin.create();
  return site.factory.published.create({
    authorId: author.id,
    type,
    slug: "hello",
    title: "Hello",
    meta,
  });
}

describe("a signed-in member on a page with no access policy", () => {
  test("is served the copy an anonymous visit stored, without a render", async () => {
    await publish("post");
    await site.visit("/post/hello");
    renders = 0;

    const page = await site.actingAs("member").visit("/post/hello");

    page
      .assertOk()
      .assertSee("Hello")
      .assertHeader("cache-control", "private, no-cache")
      .assertHeaderMissing("cache-tag")
      .assertHeaderMissing(UNIVERSAL_COPY_HEADER);
    expect(renders).toBe(0);
  });

  test("renders live and stores nothing when no copy is stored", async () => {
    await publish("post");

    const page = await site.actingAs("member").visit("/post/hello");

    page
      .assertOk()
      .assertHeader("cache-control", "private, no-store")
      .assertHeaderMissing(UNIVERSAL_COPY_HEADER);
    expect(renders).toBe(1);
    site.cdn.assertNotStored("/post/hello");
  });

  test("never stores its render as the universal copy", async () => {
    await publish("post");
    await site.actingAs("member").visit("/post/hello");
    renders = 0;

    await site.visit("/post/hello");

    expect(renders).toBe(1);
  });

  test("with an Authorization header renders live", async () => {
    await publish("post");
    await site.visit("/post/hello");
    renders = 0;

    const page = await site.actingAs("member").visit("/post/hello", {
      headers: { authorization: "Bearer not-a-token" },
    });

    page.assertHeader("cache-control", "private, no-store");
    expect(renders).toBe(1);
  });
});

describe("a principal whose render is personal from the start", () => {
  test("staff, who get the admin bar, render live", async () => {
    await publish("post");
    await site.visit("/post/hello");
    renders = 0;

    const page = await site.actingAs("admin").visit("/post/hello");

    page
      .assertSee('data-testid="plumix-admin-bar"')
      .assertHeader("cache-control", "private, no-store");
    expect(renders).toBe(1);
  });

  test("a member whose locale differs from the request's renders live", async () => {
    await publish("post");
    await site.visit("/post/hello");
    renders = 0;
    const member = await site.factory.user.create({
      role: "member",
      meta: { locale: "de" },
    });

    const page = await site.actingAs(member).visit("/post/hello");

    page
      .assertSee('<html lang="de"')
      .assertHeader("cache-control", "private, no-store");
    expect(renders).toBe(1);
  });
});

describe("a signed-in member on a policied page", () => {
  test("gets the full body, never the teaser an anonymous visit stored", async () => {
    await publish("page", { [ACCESS_POLICY_META_KEY]: "teaser" });
    await site.visit("/page/hello");
    renders = 0;

    const page = await site.actingAs("member").visit("/page/hello");

    page
      .assertOk()
      .assertHeader("cache-control", "private, no-store")
      .assertHeaderMissing(UNIVERSAL_COPY_HEADER);
    expect(renders).toBe(1);
  });

  test("on the default policy renders live", async () => {
    await publish("page");
    await site.visit("/page/hello");
    renders = 0;

    const page = await site.actingAs("member").visit("/page/hello");

    page.assertHeader("cache-control", "private, no-store");
    expect(renders).toBe(1);
  });
});

describe("an anonymous visitor", () => {
  test("never sees the universal marker, on a miss or a hit", async () => {
    await publish("post");

    const miss = await site.visit("/post/hello");
    const hit = await site.visit("/post/hello");

    miss.assertHeaderMissing(UNIVERSAL_COPY_HEADER);
    hit.assertHeaderMissing(UNIVERSAL_COPY_HEADER);
    expect(renders).toBe(1);
  });
});
