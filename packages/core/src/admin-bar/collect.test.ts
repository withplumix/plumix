import { describe, expect, test, vi } from "vitest";

import type { AdminBarNode, BarRenderContext } from "./types.js";
import { HookRegistry } from "../hooks/registry.js";
import { collectAdminBarNodes } from "./collect.js";

const baseCtx: BarRenderContext = {
  user: { id: 1, email: "u@x", role: "admin", meta: {} },
  queriedEntry: null,
  request: new Request("https://cms.example/"),
  siteName: "Site",
  auth: { can: () => true },
};

describe("collectAdminBarNodes", () => {
  test("returns an empty array when no handlers are registered", () => {
    const hooks = new HookRegistry();

    const nodes = collectAdminBarNodes(hooks, baseCtx);

    expect(nodes).toEqual([]);
  });

  test("isolates a throwing handler so the chain continues with the prior good state", () => {
    const errors: unknown[] = [];
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((_msg, err) => {
        errors.push(err);
      });
    try {
      const hooks = new HookRegistry();
      hooks.addFilter(
        "admin_bar:nodes",
        (nodes) => [...nodes, { id: "site", title: "Site", group: "root" }],
        { plugin: "first" },
      );
      hooks.addFilter(
        "admin_bar:nodes",
        () => {
          throw new Error("boom");
        },
        { plugin: "blowup" },
      );
      hooks.addFilter(
        "admin_bar:nodes",
        (nodes) => [...nodes, { id: "edit", title: "Edit", group: "primary" }],
        { plugin: "third" },
      );

      const nodes = collectAdminBarNodes(hooks, baseCtx);

      expect(nodes).toEqual([
        { id: "site", title: "Site", group: "root" },
        { id: "edit", title: "Edit", group: "primary" },
      ]);
      expect(errors).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("warns on within-handler duplicate ids in a single contribution", () => {
    const warnings: string[] = [];
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation((msg: string) => {
        warnings.push(msg);
      });
    try {
      const hooks = new HookRegistry();
      hooks.addFilter("admin_bar:nodes", (nodes) => [
        ...nodes,
        { id: "edit", title: "Edit (first)", group: "primary" },
        { id: "edit", title: "Edit (second)", group: "primary" },
      ]);

      const nodes = collectAdminBarNodes(hooks, baseCtx);

      expect(nodes).toEqual([
        { id: "edit", title: "Edit (second)", group: "primary" },
      ]);
      expect(warnings.some((w) => w.includes("edit"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test.each([
    ["string", "oops"],
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
    ["object", { not: "an array" }],
  ])(
    "discards a handler that returns %s and continues with the prior good state",
    (_label, badReturn) => {
      const errorCalls: number[] = [];
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
        errorCalls.push(1);
      });
      try {
        const hooks = new HookRegistry();
        hooks.addFilter(
          "admin_bar:nodes",
          (nodes) => [...nodes, { id: "site", title: "Site", group: "root" }],
          { plugin: "first" },
        );
        hooks.addFilter(
          "admin_bar:nodes",
          () => badReturn as unknown as readonly AdminBarNode[],
          { plugin: "bad" },
        );
        hooks.addFilter(
          "admin_bar:nodes",
          (nodes) => [
            ...nodes,
            { id: "edit", title: "Edit", group: "primary" },
          ],
          { plugin: "third" },
        );

        const nodes = collectAdminBarNodes(hooks, baseCtx);

        expect(nodes).toEqual([
          { id: "site", title: "Site", group: "root" },
          { id: "edit", title: "Edit", group: "primary" },
        ]);
        expect(errorCalls).toHaveLength(1);
      } finally {
        errorSpy.mockRestore();
      }
    },
  );

  test("dedupes nodes that share an id (last-wins) and warns once per collision", () => {
    const warnings: string[] = [];
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation((msg: string) => {
        warnings.push(msg);
      });
    try {
      const hooks = new HookRegistry();
      hooks.addFilter("admin_bar:nodes", (nodes) => [
        ...nodes,
        { id: "site", title: "Site (first)", group: "root" },
        { id: "edit", title: "Edit", group: "primary" },
      ]);
      hooks.addFilter("admin_bar:nodes", (nodes) => [
        ...nodes,
        { id: "site", title: "Site (override)", group: "root" },
      ]);

      const nodes = collectAdminBarNodes(hooks, baseCtx);

      expect(nodes).toEqual([
        { id: "site", title: "Site (override)", group: "root" },
        { id: "edit", title: "Edit", group: "primary" },
      ]);
      expect(warnings.some((w) => w.includes("site"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("flows registered handlers' contributions through in priority order", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("admin_bar:nodes", (nodes) => [
      ...nodes,
      { id: "site", title: "Site", group: "root" },
    ]);
    hooks.addFilter("admin_bar:nodes", (nodes) => [
      ...nodes,
      { id: "edit", title: "Edit", group: "primary" },
    ]);

    const nodes = collectAdminBarNodes(hooks, baseCtx);

    expect(nodes).toEqual([
      { id: "site", title: "Site", group: "root" },
      { id: "edit", title: "Edit", group: "primary" },
    ]);
  });
});
