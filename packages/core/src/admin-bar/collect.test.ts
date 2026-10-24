import { describe, expect, test, vi } from "vitest";

import type { RegisteredAdminBarNode } from "../plugin/admin-bar-node.js";
import type { BarRenderContext } from "./types.js";
import { silentLogger } from "../test/context.js";
import { collectAdminBarNodes } from "./collect.js";

const bar: BarRenderContext = {
  user: { id: 1, email: "u@x", role: "admin", meta: {} },
  queriedEntry: null,
  request: new Request("https://cms.example/"),
  siteName: "Site",
  auth: { can: () => true },
  entryTypes: new Map(),
  locale: "en",
  direction: "ltr",
};

function node(
  id: string,
  rest: Partial<RegisteredAdminBarNode> = {},
): RegisteredAdminBarNode {
  return {
    id,
    group: "primary",
    title: id,
    registeredBy: "shop",
    ...rest,
  };
}

function ids(nodes: readonly { readonly id: string }[]): string[] {
  return nodes.map((n) => n.id);
}

describe("collectAdminBarNodes", () => {
  test("returns an empty array when nothing is registered", () => {
    expect(collectAdminBarNodes([], bar, silentLogger)).toEqual([]);
  });

  test("resolves a node's title and href against the bar", () => {
    const [resolved] = collectAdminBarNodes(
      [
        node("a", {
          title: (b) => `Hi ${b.siteName}`,
          href: (b) => `/${b.user.id}`,
        }),
      ],
      bar,
      silentLogger,
    );

    expect(resolved).toMatchObject({ title: "Hi Site", href: "/1" });
  });

  test("sorts early before default before late, keeping registration order within one", () => {
    const nodes = [
      node("late", { order: "late" }),
      node("d1"),
      node("early", { order: "early" }),
      node("d2"),
    ];

    expect(ids(collectAdminBarNodes(nodes, bar, silentLogger))).toEqual([
      "early",
      "d1",
      "d2",
      "late",
    ]);
  });

  test("leaves out a node whose title throws and logs it", () => {
    const logger = { ...silentLogger, error: vi.fn() };
    const boom = new Error("no title");

    const shown = collectAdminBarNodes(
      [
        node("bad", {
          title: () => {
            throw boom;
          },
        }),
        node("ok"),
      ],
      bar,
      logger,
    );

    expect(ids(shown)).toEqual(["ok"]);
    expect(logger.error).toHaveBeenCalledWith(
      "admin_bar_node_failed: no title",
      {
        node: "bad",
        plugin: "shop",
        error: boom,
      },
    );
  });

  test("names core as the plugin when a core node throws", () => {
    const logger = { ...silentLogger, error: vi.fn() };

    collectAdminBarNodes(
      [
        node("site", {
          registeredBy: null,
          visible: () => {
            throw new Error("x");
          },
        }),
      ],
      bar,
      logger,
    );

    expect(logger.error).toHaveBeenCalledWith(
      "admin_bar_node_failed: x",
      expect.objectContaining({ plugin: "core" }),
    );
  });

  test("drops every descendant of a hidden node, however deep", () => {
    const shown = collectAdminBarNodes(
      [
        node("root", { visible: () => false }),
        node("child", { parent: "root" }),
        node("grandchild", { parent: "child" }),
        node("other"),
      ],
      bar,
      silentLogger,
    );

    expect(ids(shown)).toEqual(["other"]);
  });

  test("keeps a visible child of a visible parent", () => {
    const shown = collectAdminBarNodes(
      [node("root"), node("child", { parent: "root" })],
      bar,
      silentLogger,
    );

    expect(ids(shown)).toEqual(["root", "child"]);
  });
});
