import { afterEach, describe, expect, test, vi } from "vitest";

import type { DispatcherHarness } from "@plumix/core/test";
import { createDispatcherHarness } from "@plumix/core/test";

import { remoteDeps } from "../api-token.js";
import { settleDeployedSite } from "./settle-remote.js";

/** The deployed site: requests to `https://cms.example` are dispatched into it. */
async function deployed(): Promise<DispatcherHarness> {
  const h = await createDispatcherHarness();
  vi.spyOn(remoteDeps, "fetch").mockImplementation((url, init) =>
    h.dispatch(new Request(url, init)),
  );
  return h;
}

async function tokenFor(
  h: DispatcherHarness,
  role: "admin" | "editor",
): Promise<string> {
  const user = await h.seedUser(role);
  const { secret } = await h.factory.apiToken.create({
    userId: user.id,
    scopes: null,
    expiresAt: null,
  });
  return secret;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("settleDeployedSite", () => {
  test("runs the deployed site's settle with the token its resolver gives, not PLUMIX_API_TOKEN", async () => {
    const h = await deployed();
    vi.stubEnv("PLUMIX_API_TOKEN", "");
    const token = await tokenFor(h, "admin");

    const settled = await settleDeployedSite(
      "https://cms.example",
      { scopes: ["content"], direction: "push" },
      () => Promise.resolve(token),
    );

    expect(settled).toEqual({ cdn: "none", failures: [] });
  });

  test("a token whose user may not manage settings fails with sync_settle_refused", async () => {
    const h = await deployed();
    const token = await tokenFor(h, "editor");

    await expect(
      settleDeployedSite(
        "https://cms.example",
        { scopes: ["content"], direction: "push" },
        () => Promise.resolve(token),
      ),
    ).rejects.toMatchObject({
      code: "sync_settle_refused",
      message: "The deployed site answered 403 to the settle after the import",
    });
  });

  test("a resolver that finds no token fails the settle with its error and calls no site", async () => {
    await deployed();
    const missing = new Error("no token");

    await expect(
      settleDeployedSite(
        "https://cms.example",
        { scopes: ["content"], direction: "push" },
        () => Promise.reject(missing),
      ),
    ).rejects.toBe(missing);
    expect(remoteDeps.fetch).not.toHaveBeenCalled();
  });
});
