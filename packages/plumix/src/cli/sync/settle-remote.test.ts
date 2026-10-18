import { afterEach, describe, expect, test, vi } from "vitest";

import type { DispatcherHarness } from "@plumix/core/test";
import { createDispatcherHarness } from "@plumix/core/test";

import { remoteDeps } from "../api-token.js";
import { syncDeps } from "../commands/sync.js";
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
  test("runs the deployed site's settle with PLUMIX_API_TOKEN and returns its report", async () => {
    const h = await deployed();
    vi.stubEnv("PLUMIX_API_TOKEN", await tokenFor(h, "admin"));

    const settled = await settleDeployedSite("https://cms.example", {
      scopes: ["content"],
      direction: "push",
    });

    expect(settled).toEqual({ cdn: "none", failures: [] });
  });

  test("a token whose user may not manage settings fails with sync_settle_refused", async () => {
    const h = await deployed();
    vi.stubEnv("PLUMIX_API_TOKEN", await tokenFor(h, "editor"));

    await expect(
      settleDeployedSite("https://cms.example", {
        scopes: ["content"],
        direction: "push",
      }),
    ).rejects.toMatchObject({
      code: "sync_settle_refused",
      message: "The deployed site answered 403 to the settle after the import",
    });
  });

  test("with no token and no terminal to authorize one, fails with sync_remote_token_missing", async () => {
    await deployed();
    vi.stubEnv("PLUMIX_API_TOKEN", "");
    vi.spyOn(syncDeps, "isInteractive").mockReturnValue(false);

    await expect(
      settleDeployedSite("https://cms.example", {
        scopes: ["content"],
        direction: "push",
      }),
    ).rejects.toMatchObject({ code: "sync_remote_token_missing" });
  });
});
