import { beforeAll, describe, expect, test, vi } from "vitest";

import { HookRegistry } from "../../hooks/registry.js";
import { createTestContext, silentLogger } from "../../test/context.js";
import { createTestDb } from "../../test/harness.js";
import { devErrorResponse } from "./respond.js";

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  db = await createTestDb();
});

function contributingHooks(): HookRegistry {
  const hooks = new HookRegistry();
  hooks.addFilter("error_page:hints", (hints) => [
    ...hints,
    { title: "Try turning it off" },
  ]);
  hooks.addFilter("error_page:panels", (panels) => [
    ...panels,
    { id: "cache", title: "Cache state", render: () => "cold" },
  ]);
  return hooks;
}

// An error whose own stack cannot be read breaks every renderer that reports
// it, which is the one failure the surface has to absorb rather than pass on.
function unreadableError(): Error {
  const err = new Error("boom");
  Object.defineProperty(err, "stack", {
    get: () => {
      throw new Error("stack unavailable");
    },
  });
  return err;
}

describe("devErrorResponse", () => {
  test("an HTML caller gets the page, with its hints, context and panels", async () => {
    const ctx = createTestContext({ db, hooks: contributingHooks() });

    const response = devErrorResponse(ctx, new Error("kaboom"), true);

    expect(response?.status).toBe(500);
    expect(response?.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    const body = (await response?.text()) ?? "";
    expect(body).toContain("kaboom");
    expect(body).toContain("Try turning it off");
    expect(body).toContain('data-testid="plumix-dev-error-request"');
    expect(body).toContain("Cache state");
  });

  test("any other caller gets the exception and its hints as JSON", async () => {
    const ctx = createTestContext({ db, hooks: contributingHooks() });

    const response = devErrorResponse(ctx, new Error("kaboom"), false);

    expect(response?.status).toBe(500);
    expect(await response?.json()).toMatchObject({
      message: "kaboom",
      hints: [{ title: "Try turning it off" }],
    });
  });

  test.each([true, false])(
    "a surface that cannot render answers null and says why (html: %s)",
    (wantsHtml) => {
      const error = vi.fn();
      const ctx = createTestContext({
        db,
        logger: { ...silentLogger, error },
      });

      expect(devErrorResponse(ctx, unreadableError(), wantsHtml)).toBeNull();
      expect(error).toHaveBeenCalledWith("dev_error_page_failed", {
        url: ctx.request.url,
        err: "stack unavailable",
      });
    },
  );
});
