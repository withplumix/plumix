import { beforeAll, describe, expect, test, vi } from "vitest";

import type { Db } from "../../../context/app-context.js";
import type { DevErrorPanel } from "../../../context/dev-runtime.js";
import { createDevRuntime } from "../../../runtime/dev.js";
import { createTestContext, silentLogger } from "../../../test/context.js";
import { createTestDb } from "../../../test/harness.js";
import { registerDevItem } from "../../registrations.js";
import { collectDevErrorPanels } from "./collect.js";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

function panel(id: string, over: Partial<DevErrorPanel> = {}): DevErrorPanel {
  return { id, title: id, render: () => <p>{id}</p>, ...over };
}

describe("collectDevErrorPanels", () => {
  test("returns an empty array when no panel is registered", () => {
    const ctx = createTestContext({ db });

    expect(
      collectDevErrorPanels(
        createDevRuntime(undefined),
        new Error("boom"),
        ctx,
      ),
    ).toEqual([]);
  });

  test("renders a registered panel from the caught error", () => {
    const dev = createDevRuntime(undefined);
    registerDevItem(
      dev.errorPanels,
      "error panel",
      panel("queue", {
        title: "Queue",
        render: (error) => <p>{(error as Error).message}</p>,
      }),
      "queue-plugin",
    );
    const ctx = createTestContext({ db });

    expect(collectDevErrorPanels(dev, new Error("3 jobs"), ctx)).toEqual([
      { id: "queue", title: "Queue", html: "<p>3 jobs</p>" },
    ]);
  });

  test("leaves out a panel whose `visible` turns the error down", () => {
    const dev = createDevRuntime(undefined);
    registerDevItem(
      dev.errorPanels,
      "error panel",
      panel("database", {
        visible: (error) => (error as Error).message.includes("SQLITE"),
      }),
      "db-plugin",
    );
    const ctx = createTestContext({ db });

    expect(collectDevErrorPanels(dev, new Error("boom"), ctx)).toEqual([]);
  });

  test("leaves out and logs a panel whose `visible` throws", () => {
    const error = vi.fn();
    const dev = createDevRuntime(undefined);
    registerDevItem(
      dev.errorPanels,
      "error panel",
      panel("bad", {
        visible: () => {
          throw new Error("visible blew up");
        },
      }),
      "bad-plugin",
    );
    registerDevItem(dev.errorPanels, "error panel", panel("good"), null);
    const ctx = createTestContext({ db, logger: { ...silentLogger, error } });

    const rendered = collectDevErrorPanels(dev, new Error("boom"), ctx);

    expect(rendered.map((p) => p.id)).toEqual(["good"]);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      '[plumix] error panel "bad" failed plugin=bad-plugin: visible blew up',
      expect.objectContaining({ id: "bad", plugin: "bad-plugin" }),
    );
  });

  test("leaves out and logs a panel whose render throws", () => {
    const error = vi.fn();
    const dev = createDevRuntime(undefined);
    registerDevItem(
      dev.errorPanels,
      "error panel",
      panel("bad", {
        render: () => {
          throw new Error("panel blew up");
        },
      }),
      null,
    );
    registerDevItem(dev.errorPanels, "error panel", panel("good"), null);
    const ctx = createTestContext({ db, logger: { ...silentLogger, error } });

    const rendered = collectDevErrorPanels(dev, new Error("boom"), ctx);

    expect(rendered.map((p) => p.id)).toEqual(["good"]);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      '[plumix] error panel "bad" failed plugin=core: panel blew up',
      expect.objectContaining({ id: "bad", plugin: null }),
    );
  });

  test("sorts unordered panels after every explicitly ordered one", () => {
    const dev = createDevRuntime(undefined);
    registerDevItem(dev.errorPanels, "error panel", panel("loose"), null);
    registerDevItem(
      dev.errorPanels,
      "error panel",
      panel("late", { order: 20 }),
      null,
    );
    registerDevItem(
      dev.errorPanels,
      "error panel",
      panel("pinned", { order: 5 }),
      null,
    );
    const ctx = createTestContext({ db });

    expect(
      collectDevErrorPanels(dev, new Error("boom"), ctx).map((p) => p.id),
    ).toEqual(["pinned", "late", "loose"]);
  });
});
