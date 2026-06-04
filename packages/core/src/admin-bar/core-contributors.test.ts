import { describe, expect, test } from "vitest";

import type { BarRenderContext } from "./types.js";
import { HookRegistry } from "../hooks/registry.js";
import { collectAdminBarNodes } from "./collect.js";
import { registerCoreAdminBarContributors } from "./core-contributors.js";

const allow = (): boolean => true;
const deny = (): boolean => false;

function ctx(overrides: Partial<BarRenderContext> = {}): BarRenderContext {
  return {
    user: {
      id: 1,
      email: "editor@cms.example",
      role: "editor",
      meta: {},
    },
    queriedEntry: null,
    request: new Request("https://cms.example/"),
    siteName: "My Site",
    auth: { can: allow },
    entryTypes: new Map(),
    ...overrides,
  };
}

function typesMap(...slugs: readonly string[]): BarRenderContext["entryTypes"] {
  return new Map(slugs.map((slug) => [slug, { name: slug } as never]));
}

function withCore(): HookRegistry {
  const hooks = new HookRegistry();
  registerCoreAdminBarContributors(hooks);
  return hooks;
}

describe("registerCoreAdminBarContributors — site link", () => {
  test("adds a 'site' node pointing at the admin root with the resolved site name", () => {
    const nodes = collectAdminBarNodes(withCore(), ctx());

    const site = nodes.find((n) => n.id === "site");
    expect(site).toEqual({
      id: "site",
      title: "My Site",
      href: "/_plumix/admin",
      group: "root",
      position: 10,
    });
  });
});

describe("registerCoreAdminBarContributors — +New group", () => {
  test("emits a parent group with no children when no entry types are registered", () => {
    const nodes = collectAdminBarNodes(withCore(), ctx());

    const newGroup = nodes.find((n) => n.id === "+new");
    expect(newGroup).toBeDefined();
    expect(nodes.filter((n) => n.parent === "+new")).toEqual([]);
  });

  test("adds one child per registered entry type, in registration order", () => {
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({ entryTypes: typesMap("post", "page", "media") }),
    );

    const children = nodes.filter((n) => n.parent === "+new");
    expect(children.map((n) => n.id)).toEqual([
      "+new:post",
      "+new:page",
      "+new:media",
    ]);
    expect(children.map((n) => n.href)).toEqual([
      "/_plumix/admin/entries/post/create",
      "/_plumix/admin/entries/page/create",
      "/_plumix/admin/entries/media/create",
    ]);
  });

  test("plugin can suppress its own entry type from the menu via the filter", () => {
    const hooks = withCore();
    hooks.addFilter(
      "admin_bar:nodes",
      (nodes) => nodes.filter((n) => n.id !== "+new:media"),
      { plugin: "media", priority: 100 },
    );

    const nodes = collectAdminBarNodes(
      hooks,
      ctx({ entryTypes: typesMap("post", "page", "media") }),
    );

    const children = nodes.filter((n) => n.parent === "+new");
    expect(children.map((n) => n.id)).toEqual(["+new:post", "+new:page"]);
  });
});

describe("registerCoreAdminBarContributors — account link", () => {
  test("adds an 'account' node titled with the user's email", () => {
    const nodes = collectAdminBarNodes(withCore(), ctx());

    const account = nodes.find((n) => n.id === "account");
    expect(account).toEqual({
      id: "account",
      title: "editor@cms.example",
      href: "/_plumix/admin/profile",
      group: "account",
      position: 10,
    });
  });
});

describe("registerCoreAdminBarContributors — edit-this link", () => {
  test("does not appear when there is no queried entry", () => {
    const nodes = collectAdminBarNodes(withCore(), ctx());
    expect(nodes.find((n) => n.id === "edit-this")).toBeUndefined();
  });

  test("does not appear when queried entry lacks pre-resolved details", () => {
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({ queriedEntry: { kind: "entry", id: 42 } }),
    );
    expect(nodes.find((n) => n.id === "edit-this")).toBeUndefined();
  });

  test("appears for a non-author when auth allows edit_any", () => {
    const seen: string[] = [];
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({
        queriedEntry: { kind: "entry", id: 42 },
        queriedEntryDetails: { type: "post", authorId: 999 },
        auth: {
          can: (cap: string) => {
            seen.push(cap);
            return cap === "entry:post:edit_any";
          },
        },
      }),
    );

    expect(nodes.find((n) => n.id === "edit-this")).toEqual({
      id: "edit-this",
      title: "Edit",
      href: "/_plumix/admin/entries/post/42/edit",
      group: "primary",
      position: 20,
    });
    expect(seen).toContain("entry:post:edit_any");
  });

  test("appears for the entry's author when auth allows edit_own", () => {
    const seen: string[] = [];
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({
        queriedEntry: { kind: "entry", id: 7 },
        queriedEntryDetails: { type: "post", authorId: 1 },
        auth: {
          can: (cap: string) => {
            seen.push(cap);
            return cap === "entry:post:edit_own";
          },
        },
      }),
    );

    expect(nodes.find((n) => n.id === "edit-this")).toBeDefined();
    expect(seen).toContain("entry:post:edit_own");
  });

  test("does not appear when user lacks the capability for own or any", () => {
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({
        queriedEntry: { kind: "entry", id: 7 },
        queriedEntryDetails: { type: "post", authorId: 999 },
        auth: { can: deny },
      }),
    );

    expect(nodes.find((n) => n.id === "edit-this")).toBeUndefined();
  });
});
