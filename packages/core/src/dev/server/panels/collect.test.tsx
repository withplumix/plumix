import { describe, expect, test } from "vitest";

import type { AppContext } from "../../../context/app.js";
import type { DevErrorPanel } from "./types.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { collectDevErrorPanels } from "./collect.js";

// collect passes ctx opaquely to handlers; these tests never read it.
const ctx = {} as AppContext;

function panel(id: string, over: Partial<DevErrorPanel> = {}): DevErrorPanel {
  return { id, title: id, render: () => <p>{id}</p>, ...over };
}

describe("collectDevErrorPanels", () => {
  test("returns an empty array when nothing is subscribed", () => {
    const hooks = new HookRegistry();

    expect(collectDevErrorPanels(hooks, new Error("boom"), ctx)).toEqual([]);
  });

  test("passes the thrown error and ctx to each handler and renders its panels", () => {
    const hooks = new HookRegistry();
    const seen: unknown[] = [];
    hooks.addFilter("error_page:panels", (panels, error) => {
      seen.push(error);
      return [
        ...panels,
        panel("queue", { title: "Queue", render: () => <p>3 jobs</p> }),
      ];
    });

    const err = new Error("boom");
    const rendered = collectDevErrorPanels(hooks, err, ctx);

    expect(rendered).toEqual([
      { id: "queue", title: "Queue", html: "<p>3 jobs</p>" },
    ]);
    expect(seen).toEqual([err]);
  });

  test("isolates a throwing handler so one bad subscriber can't sink the rest", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("error_page:panels", () => {
      throw new Error("subscriber blew up");
    });
    hooks.addFilter("error_page:panels", (panels) => [
      ...panels,
      panel("survives"),
    ]);

    expect(
      collectDevErrorPanels(hooks, new Error("boom"), ctx).map((p) => p.id),
    ).toEqual(["survives"]);
  });

  test("renders a panel whose own render throws as a fallback, not a crash", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("error_page:panels", (panels) => [
      ...panels,
      panel("bad", {
        render: () => {
          throw new Error("panel blew up");
        },
      }),
      panel("good", { render: () => <p>ok</p> }),
    ]);

    const rendered = collectDevErrorPanels(hooks, new Error("boom"), ctx);

    expect(rendered.map((p) => p.id)).toEqual(["bad", "good"]);
    // The bad panel degrades to a notice naming its id; the good one renders.
    expect(rendered[0]?.html).toContain("bad");
    expect(rendered[1]?.html).toBe("<p>ok</p>");
  });

  test("dedupes by id (last contributor wins) and orders by ascending order", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("error_page:panels", (panels) => [
      ...panels,
      panel("a", { order: 20, render: () => <p>first-a</p> }),
      panel("b", { order: 10, render: () => <p>b</p> }),
      panel("a", { order: 20, render: () => <p>second-a</p> }),
    ]);

    const rendered = collectDevErrorPanels(hooks, new Error("boom"), ctx);

    expect(rendered.map((p) => p.id)).toEqual(["b", "a"]);
    // Last "a" wins.
    expect(rendered[1]?.html).toBe("<p>second-a</p>");
  });

  test("sorts unordered panels after every explicitly ordered one", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("error_page:panels", (panels) => [
      ...panels,
      panel("loose"),
      panel("pinned", { order: 5 }),
    ]);

    expect(
      collectDevErrorPanels(hooks, new Error("boom"), ctx).map((p) => p.id),
    ).toEqual(["pinned", "loose"]);
  });
});
