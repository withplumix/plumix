import { describe, expect, test, vi } from "vitest";

import { renderTurnstileWidget, verifyTurnstile } from "./turnstile.js";

function fetchReturning(ok: boolean, body: unknown) {
  return vi.fn(() =>
    Promise.resolve(Response.json(body, { status: ok ? 200 : 500 })),
  );
}

describe("verifyTurnstile", () => {
  test("passes when siteverify reports success", async () => {
    const ok = await verifyTurnstile(
      "secret",
      "token",
      fetchReturning(true, { success: true }),
    );
    expect(ok).toBe(true);
  });

  test("fails when siteverify reports failure", async () => {
    const ok = await verifyTurnstile(
      "secret",
      "token",
      fetchReturning(true, { success: false }),
    );
    expect(ok).toBe(false);
  });

  test("fails on an empty token without calling siteverify", async () => {
    const fetchImpl = fetchReturning(true, { success: true });
    expect(await verifyTurnstile("secret", "", fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("fails when siteverify is unreachable", async () => {
    const ok = await verifyTurnstile(
      "secret",
      "token",
      fetchReturning(false, {}),
    );
    expect(ok).toBe(false);
  });
});

describe("renderTurnstileWidget", () => {
  test("renders the widget bound to the site key", () => {
    const html = renderTurnstileWidget("site-key-123");
    expect(html).toContain('data-sitekey="site-key-123"');
    expect(html).toContain("challenges.cloudflare.com/turnstile");
  });
});
