import { describe, expect, test, vi } from "vitest";

import { createDevRuntime } from "../../../runtime/dev.js";
import { silentLogger } from "../../../test/context.js";
import { registerDevItem } from "../../registrations.js";
import { collectDevErrorHints } from "./collect.js";

describe("collectDevErrorHints", () => {
  test("returns an empty array when no hint is registered", () => {
    expect(
      collectDevErrorHints(
        createDevRuntime(undefined),
        new Error("boom"),
        silentLogger,
      ),
    ).toEqual([]);
  });

  test("returns the hints that match the error, without their registration", () => {
    const dev = createDevRuntime(undefined);
    registerDevItem(
      dev.errorHints,
      "error hint",
      {
        id: "queue",
        matches: (error) => (error as Error).message === "queue full",
        title: "Drain the queue",
        body: "Run the worker.",
      },
      "queue-plugin",
    );
    registerDevItem(
      dev.errorHints,
      "error hint",
      { id: "other", matches: () => false, title: "Unrelated" },
      "queue-plugin",
    );

    expect(
      collectDevErrorHints(dev, new Error("queue full"), silentLogger),
    ).toEqual([{ title: "Drain the queue", body: "Run the worker." }]);
  });

  test("leaves out and logs a hint whose `matches` throws", () => {
    const error = vi.fn();
    const dev = createDevRuntime(undefined);
    registerDevItem(
      dev.errorHints,
      "error hint",
      {
        id: "bad",
        matches: () => {
          throw new Error("matcher blew up");
        },
        title: "Bad",
      },
      "bad-plugin",
    );
    registerDevItem(
      dev.errorHints,
      "error hint",
      { id: "good", matches: () => true, title: "Good" },
      null,
    );

    const hints = collectDevErrorHints(dev, new Error("boom"), {
      ...silentLogger,
      error,
    });

    expect(hints).toEqual([{ title: "Good" }]);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      '[plumix] error hint "bad" failed plugin=bad-plugin: matcher blew up',
      expect.objectContaining({ id: "bad", plugin: "bad-plugin" }),
    );
  });
});
