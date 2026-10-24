import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type {
  AuthenticatedUser,
  AuthNamespace,
  Db,
  Logger,
} from "../context/app-context.js";
import type { UserRole } from "../db/schema/users.js";
import type { PluginSetup } from "../plugin/define.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { createBlockRegistry } from "../blocks/index.js";
import { PlumixProvider } from "../blocks/renderer/index.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { toRegisteredEntryType } from "../plugin/registry.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { createTestContext, silentLogger } from "../test/context.js";
import { adminBarChrome, PlumixAdminBar } from "./component.js";
import {
  registerCoreAdminBarNodes,
  registerNewEntryAdminBarNodes,
} from "./core-nodes.js";

const emptyRegistry = createBlockRegistry([]);

const user: AuthenticatedUser = {
  id: 7,
  email: "editor@cms.example",
  role: "editor",
  meta: {},
};

const request = new Request("https://cms.example/");
const auth: AuthNamespace = { can: () => true };
const entryTypes = new Map();

/** The registry as boot leaves it with core's nodes and `types`. */
function withCoreNodes(
  types: PluginRegistry["entryTypes"] = new Map(),
): PluginRegistry {
  const registry = createPluginRegistry();
  for (const [name, type] of types) registry.entryTypes.set(name, type);
  registerCoreAdminBarNodes(registry);
  registerNewEntryAdminBarNodes(registry);
  return registry;
}

/**
 * The chrome as a page renders it: the bar for the principal on the context,
 * with core's nodes registered unless a test registers its own.
 */
function renderChrome(
  viewer: AuthenticatedUser | null,
  plugins = withCoreNodes(),
): string {
  const ctx = createTestContext({ db: {} as Db, user: viewer, plugins });
  return renderToStaticMarkup(
    <PlumixProvider value={{ registry: emptyRegistry }}>
      {adminBarChrome(ctx, undefined)}
    </PlumixProvider>,
  );
}

describe("adminBarChrome", () => {
  test("renders nothing when there is no principal", () => {
    expect(renderChrome(null)).toBe("");
  });

  test("renders nothing for a subscriber, who may not use the admin", () => {
    expect(renderChrome({ ...user, role: "subscriber" })).toBe("");
  });

  test("does not ask a node whether it is visible for a subscriber", () => {
    const plugins = createPluginRegistry();
    const visible = vi.fn(() => true);
    plugins.adminBarNodes.set("shop:orders", {
      id: "shop:orders",
      group: "primary",
      title: "Orders",
      visible,
      registeredBy: "shop",
    });

    renderChrome({ ...user, role: "subscriber" }, plugins);

    expect(visible).not.toHaveBeenCalled();
  });

  test.each<UserRole>(["contributor", "admin"])(
    "renders the bar for a %s",
    (role) => {
      expect(renderChrome({ ...user, role })).toContain(
        'data-testid="plumix-admin-bar"',
      );
    },
  );
});

describe("registered admin bar nodes", () => {
  async function renderWithPlugin(
    register: PluginSetup,
    logger: Logger = silentLogger,
  ): Promise<string> {
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [definePlugin("shop", { setup: register })],
    });
    const ctx = createTestContext({
      db: {} as Db,
      user,
      plugins: registry,
      logger,
    });
    return renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        {adminBarChrome(ctx, undefined)}
      </PlumixProvider>,
    );
  }

  test("renders a plugin's node for a signed-in user", async () => {
    const html = await renderWithPlugin((ctx) => {
      ctx.registerAdminBarNode({
        id: "shop:orders",
        group: "primary",
        title: "Orders",
        href: () => "/_plumix/admin/pages/shop/orders",
      });
    });

    expect(html).toContain(
      '<li data-testid="plumix-admin-bar-node-shop:orders"><a href="/_plumix/admin/pages/shop/orders">Orders</a></li>',
    );
  });

  test("hides a node whose visible returns false", async () => {
    const html = await renderWithPlugin((ctx) => {
      ctx.registerAdminBarNode({
        id: "shop:orders",
        group: "primary",
        title: "Orders",
        visible: (bar) => bar.user.role === "admin",
      });
      ctx.registerAdminBarNode({
        id: "shop:cart",
        group: "primary",
        title: "Cart",
      });
    });

    expect(html).not.toContain("plumix-admin-bar-node-shop:orders");
    expect(html).toContain("plumix-admin-bar-node-shop:cart");
  });

  test.each([
    ["early", ["shop:orders", "shop:cart", "shop:wishlist"]],
    ["late", ["shop:cart", "shop:wishlist", "shop:orders"]],
  ] as const)(
    "places a node ordered %s ahead of registration order",
    async (order, expected) => {
      const html = await renderWithPlugin((ctx) => {
        ctx.registerAdminBarNode({
          id: "shop:cart",
          group: "primary",
          title: "Cart",
        });
        ctx.registerAdminBarNode({
          id: "shop:orders",
          group: "primary",
          title: "Orders",
          order,
        });
        ctx.registerAdminBarNode({
          id: "shop:wishlist",
          group: "primary",
          title: "Wishlist",
        });
      });

      const ids = [...html.matchAll(/plumix-admin-bar-node-(shop:\w+)/g)].map(
        (match) => match[1],
      );
      expect(ids).toEqual(expected);
    },
  );

  test("hides the children of a hidden node rather than lifting them to the top level", async () => {
    const html = await renderWithPlugin((ctx) => {
      ctx.registerAdminBarNode({
        id: "shop:menu",
        group: "primary",
        title: "Shop",
        visible: () => false,
      });
      ctx.registerAdminBarNode({
        id: "shop:orders",
        group: "primary",
        title: "Orders",
        parent: "shop:menu",
      });
    });

    expect(html).not.toContain("plumix-admin-bar-node-shop:orders");
  });

  test.each(["href", "visible"] as const)(
    "leaves out a node whose %s throws, logs it and renders the rest",
    async (throwing) => {
      const boom = new Error("orders offline");
      const logger = { ...silentLogger, error: vi.fn() };

      const html = await renderWithPlugin((ctx) => {
        ctx.registerAdminBarNode({
          id: "shop:orders",
          group: "primary",
          title: "Orders",
          [throwing]: () => {
            throw boom;
          },
        });
        ctx.registerAdminBarNode({
          id: "shop:cart",
          group: "primary",
          title: "Cart",
        });
      }, logger);

      expect(html).not.toContain("plumix-admin-bar-node-shop:orders");
      expect(html).toContain("plumix-admin-bar-node-shop:cart");
      expect(logger.error).toHaveBeenCalledWith(
        "admin_bar_node_failed: orders offline",
        { node: "shop:orders", plugin: "shop", error: boom },
      );
    },
  );
});

describe("PlumixAdminBar", () => {
  test("renders nothing when every node is hidden", () => {
    const admin: AuthenticatedUser = { ...user, role: "admin" };
    const nodes = [
      {
        id: "shop:orders",
        group: "primary",
        title: "Orders",
        visible: () => false,
        registeredBy: "shop",
      },
    ] as const;

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={admin}
          nodes={nodes}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toBe("");
  });

  test("renders the bar shell when user is populated", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar"');
  });

  test("right-anchors the account node via a dedicated class + margin-inline-start rule", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    // Account <li> carries the right-anchor class.
    expect(html).toMatch(
      /<li[^>]*data-testid="plumix-admin-bar-node-account"[^>]*class="[^"]*plumix-admin-bar__end/,
    );
    // CSS for that class pushes it to the row's end.
    expect(html).toMatch(
      /\.plumix-admin-bar__end[^{]*\{[^}]*margin-inline-start:\s*auto/,
    );
  });

  test("emits the inline CSS style block once and applies the .plumix-admin-bar class", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar-style"');
    expect(html).toContain(".plumix-admin-bar");
    expect(html).toContain('class="plumix-admin-bar"');
    expect(html).toContain("system-ui");
    expect(html).toContain("Noto Sans Arabic");
    expect(html).toContain("Noto Sans SC");
    expect(html).toMatch(/@media\s*\(max-width:\s*639px\)/);
    expect(html).toMatch(/text-overflow:\s*ellipsis/);
  });

  // Which locale renders which translation is catalog content, gated by
  // `i18n:check`; these tests cover only the locale-to-chrome wiring.
  test("renders nav with an aria-label sourced from the bar catalog", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );
    expect(html).toContain('aria-label="Admin"');
  });

  test("sets the document lang attribute from the user's locale", () => {
    const ukUser = { ...user, meta: { locale: "uk" } };

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={ukUser}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('lang="uk"');
  });

  test("applies dir='rtl' and lang='ar' when the user locale is Arabic", () => {
    const arUser = { ...user, meta: { locale: "ar" } };

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={arUser}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="موقعي"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    // Site name passed in is Arabic — the RTL chrome surrounds it.
    expect(html).toContain("موقعي");
  });

  test("wraps the user's account email in <bdi> so RTL chrome doesn't flip it", () => {
    const arUser = { ...user, meta: { locale: "ar" } };

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={arUser}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="موقعي"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain("<bdi>editor@cms.example</bdi>");
  });

  test("emits a localized +New summary aria-label for screen readers", () => {
    const types = new Map([
      ["post", toRegisteredEntryType("post", { label: "Post" }, "test")],
    ]);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(types).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={types}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('aria-label="Create new"');
  });

  test("renders the +new group as a <details>/<summary> with one child per entry type", () => {
    const types = new Map([
      ["post", toRegisteredEntryType("post", { label: "Post" }, "test")],
      ["page", toRegisteredEntryType("page", { label: "Page" }, "test")],
    ]);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(types).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={types}
        />
      </PlumixProvider>,
    );

    expect(html).toContain("<details>");
    expect(html).toContain("+ New");
    expect(html).toContain('data-testid="plumix-admin-bar-node-+new:post"');
    expect(html).toContain('data-testid="plumix-admin-bar-node-+new:page"');
    expect(html).toContain('href="/_plumix/admin/entries/posts/create"');
    expect(html).toContain('href="/_plumix/admin/entries/pages/create"');
  });

  test("lists the + New children in entry type registration order", () => {
    const types = new Map([
      ["page", toRegisteredEntryType("page", { label: "Page" }, "test")],
      ["post", toRegisteredEntryType("post", { label: "Post" }, "test")],
      ["event", toRegisteredEntryType("event", { label: "Event" }, "test")],
    ]);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(types).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={types}
        />
      </PlumixProvider>,
    );

    const children = [
      ...html.matchAll(/plumix-admin-bar-node-\+new:(\w+)/g),
    ].map((match) => match[1]);
    expect(children).toEqual(["page", "post", "event"]);
  });

  test("renders the account as a dropdown with a Profile link and a Sign out button", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain(
      'data-testid="plumix-admin-bar-node-account:profile"',
    );
    expect(html).toContain('href="/_plumix/admin/profile"');
    expect(html).toContain(
      'data-testid="plumix-admin-bar-node-account:signout"',
    );
    // Sign out is a button (needs the CSRF header), not a navigation link.
    expect(html).toMatch(/<button[^>]*data-plumix-signout/);
  });

  test("emits the inline sign-out island targeting the signout endpoint with the CSRF header", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar-signout-script"');
    expect(html).toContain("/_plumix/auth/signout");
    expect(html).toContain("X-Plumix-Request");
  });

  test("renders an avatar initial for the mobile account collapse", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    // editor@cms.example → "E"
    expect(html).toMatch(
      /class="plumix-admin-bar__avatar"[^>]*aria-hidden[^>]*>E</,
    );
  });

  test("shows the display name and derives the avatar initial from it", () => {
    const named = { ...user, name: "Alex Rivera" };

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={named}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain("<bdi>Alex Rivera</bdi>");
    expect(html).toMatch(
      /class="plumix-admin-bar__avatar"[^>]*aria-hidden[^>]*>A</,
    );
  });

  test("keeps the bar visible on small screens (never sets the bar to display:none)", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).not.toMatch(/\.plumix-admin-bar\s*\{[^}]*display:\s*none/);
    // It grows for touch instead of disappearing.
    expect(html).toMatch(/@media\s*\(max-width:\s*639px\)/);
    expect(html).toContain("height: 46px");
  });

  test("renders core nodes as anchors with stable testids", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry }}>
        <PlumixAdminBar
          viewer={user}
          nodes={withCoreNodes(entryTypes).adminBarNodes.values()}
          logger={silentLogger}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar-node-site"');
    expect(html).toContain('href="/_plumix/admin"');
    expect(html).toContain("My Site");
    expect(html).toContain('data-testid="plumix-admin-bar-node-account"');
    expect(html).toContain("editor@cms.example");
  });
});
