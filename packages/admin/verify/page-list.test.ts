import { describe, expect, it } from "vitest";

import type { PluginDescriptor } from "@plumix/core";
import {
  createPluginRegistry,
  definePlugin,
  HandlerRegistry,
  installPlugins,
} from "@plumix/core";

import { adminPageList } from "./page-list.js";

async function registryOf(...plugins: PluginDescriptor[]) {
  const { registry } = await installPlugins({
    handlers: new HandlerRegistry(),
    plugins,
  });
  return registry;
}

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

describe("adminPageList", () => {
  it("lists each sidebar item with its route and the capability it needs", async () => {
    const registry = await registryOf(blog);

    const pages = adminPageList(registry);

    expect(
      pages.map(({ route, capability }) => ({ route, capability })),
    ).toEqual([
      { route: "/", capability: undefined },
      { route: "/entries/posts", capability: "entry:post:edit_own" },
      { route: "/users", capability: "user:list" },
    ]);
  });

  it("names each page after its route, and the root route dashboard", async () => {
    const registry = await registryOf(blog);

    const pages = adminPageList(registry);

    expect(pages.map((page) => page.id)).toEqual([
      "dashboard",
      "entries-posts",
      "users",
    ]);
  });

  it("lists a plugin page that has no sidebar item, once", async () => {
    const forms = definePlugin("forms", {
      setup: (ctx) => {
        ctx.registerAdminPage({
          path: "/forms",
          title: "Forms",
          nav: { group: "content", label: "Forms" },
          capability: "settings:manage",
          component: "FormsPage",
        });
        ctx.registerAdminPage({
          path: "/forms/submissions",
          title: "Submissions",
          capability: "settings:manage",
          component: "SubmissionsPage",
        });
      },
    });
    const registry = await registryOf(forms);

    const pages = adminPageList(registry);

    expect(
      pages
        .filter((page) => page.route.startsWith("/pages/"))
        .map(({ id, route, capability }) => ({ id, route, capability })),
    ).toEqual([
      {
        id: "pages-forms",
        route: "/pages/forms",
        capability: "settings:manage",
      },
      {
        id: "pages-forms-submissions",
        route: "/pages/forms/submissions",
        capability: "settings:manage",
      },
    ]);
  });

  it("lists each settings page, which needs settings:manage", async () => {
    const seo = definePlugin("seo", {
      setup: (ctx) => {
        ctx.registerSettingsPage("seo", { label: "SEO", groups: [] });
      },
    });
    const registry = await registryOf(seo);

    const pages = adminPageList(registry);

    expect(
      pages
        .filter((page) => page.route.startsWith("/settings"))
        .map(({ id, route, capability }) => ({ id, route, capability })),
    ).toEqual([
      { id: "settings", route: "/settings", capability: "settings:manage" },
      {
        id: "settings-seo",
        route: "/settings/seo",
        capability: "settings:manage",
      },
    ]);
  });

  it("names the roles that can open each page: admin access plus the page's capability", async () => {
    const { registry } = await installPlugins({
      handlers: new HandlerRegistry(),
      plugins: [blog],
      registry: createPluginRegistry(undefined, {
        contributor: {
          can: { admin: ["access"], entry: { post: ["edit_own"] } },
        },
      }),
    });

    const pages = adminPageList(registry);

    expect(pages.map(({ route, roles }) => ({ route, roles }))).toEqual([
      { route: "/", roles: ["author", "editor", "admin", "contributor"] },
      {
        route: "/entries/posts",
        roles: ["author", "editor", "admin", "contributor"],
      },
      { route: "/users", roles: ["editor", "admin"] },
    ]);
  });
});
