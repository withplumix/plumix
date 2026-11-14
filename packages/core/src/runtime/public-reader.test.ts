import { describe, expect, test, vi } from "vitest";

import type { AuthResult } from "../auth/authenticator.js";
import { createDispatcherHarness, plumixRequest } from "../test/dispatcher.js";

describe("a public render's reader", () => {
  test("anonymous public request never invokes the authenticator (zero added DB hits)", async () => {
    const authenticate =
      vi.fn<(request: Request) => Promise<AuthResult | null>>();
    const h = await createDispatcherHarness({
      config: { auth: { authenticator: { authenticate } } },
    });

    await h.dispatch(plumixRequest("/", { method: "GET" }));

    expect(authenticate).not.toHaveBeenCalled();
  });

  test("authenticated public request invokes the authenticator exactly once", async () => {
    const authenticate = vi.fn<
      (request: Request) => Promise<AuthResult | null>
    >(() => Promise.resolve(null));
    const h = await createDispatcherHarness({
      config: { auth: { authenticator: { authenticate } } },
    });
    const user = await h.seedUser("editor");
    const request = await h.authenticateRequest(
      plumixRequest("/", { method: "GET" }),
      user.id,
    );

    await h.dispatch(request);

    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  test("authenticator throwing on a public request degrades through the existing error boundary instead of escaping the dispatcher", async () => {
    const h = await createDispatcherHarness({
      config: {
        auth: {
          authenticator: {
            authenticate: () => Promise.reject(new Error("db blip")),
          },
        },
      },
    });
    const user = await h.seedUser("editor");
    const request = await h.authenticateRequest(
      plumixRequest("/", { method: "GET" }),
      user.id,
    );

    const response = await h.dispatch(request);

    expect(response.status).toBe(500);
  });
});
