import { describe, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { entry, fallback } from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

const theme = defineTheme({
  templates: [
    fallback(() => null),
    entry(({ data }) => <article>{data.entry.title}</article>),
  ],
});

const site = await testSite({
  plugins: [blogPlugin],
  config: { theme, i18n: { defaultLocale: "en", locales: ["en", "ar"] } },
});

describe("a public page's locale", () => {
  test("public route stays on site default — Accept-Language is intentionally ignored (WP get_locale parity)", async () => {
    await site.factory.published.create({
      slug: "cacheable",
      title: "Cacheable",
    });

    const page = await site.visit("/post/cacheable", {
      headers: { "accept-language": "ar" },
    });

    // Site default wins — public HTML is identical for every visitor, so
    // CDN caching by URL alone is correct without `Vary: Accept-Language`.
    page.assertSee('<html lang="en" dir="ltr">');
  });

  test("authenticated visitor of a public URL still sees the site default (WP frontend vs admin split)", async () => {
    const admin = await site.factory.user.create({
      role: "admin",
      meta: { locale: "ar" },
    });
    await site.factory.published.create({
      slug: "public",
      title: "Public",
      authorId: admin.id,
    });

    const page = await site.actingAs(admin).visit("/post/public");

    // Even with user.meta.locale = "ar", `resolveLocale` path-gates the
    // user-locale lookup to `/_plumix/*` — public-route HTML stays at the
    // site default so CDN cache keys don't fragment by admin-user prefs.
    page.assertSee('<html lang="en" dir="ltr">');
  });
});

const rtl = await testSite({
  plugins: [blogPlugin],
  config: { theme, i18n: { defaultLocale: "ar", locales: ["ar", "en"] } },
});

describe("a site whose default locale is right-to-left", () => {
  test("site's i18n defaultLocale drives <html lang dir> (RTL example)", async () => {
    await rtl.factory.published.create({ slug: "rtl", title: "RTL" });

    const page = await rtl.visit("/post/rtl");

    page.assertSee('<html lang="ar" dir="rtl">');
  });
});
