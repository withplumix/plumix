import { afterEach, describe, expect, test, vi } from "vitest";

import { AdminRuntimeError } from "../errors.js";
import { basePath, isSlotConfigured } from "./index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** What the admin shell publishes once it has booted. */
function bootShell(published: object): void {
  vi.stubGlobal("plumix", published);
}

describe("isSlotConfigured", () => {
  test("answers from the roster the admin shell published", () => {
    bootShell({
      configuredSlots: {
        storage: true,
        imageDelivery: false,
        kv: false,
        cdn: false,
        mailer: true,
      },
    });

    expect(isSlotConfigured("storage")).toBe(true);
    expect(isSlotConfigured("mailer")).toBe(true);
    expect(isSlotConfigured("imageDelivery")).toBe(false);
  });

  test("throws before the admin shell has booted", () => {
    expect(() => isSlotConfigured("mailer")).toThrow(AdminRuntimeError);
  });
});

describe("basePath", () => {
  test("is the subdirectory mount the admin shell published", () => {
    bootShell({ basePath: "/site" });

    expect(basePath()).toBe("/site");
  });

  test("is the domain root before the admin shell has booted", () => {
    expect(basePath()).toBe("");
  });
});
