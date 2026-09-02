import { describe, expect, test } from "vitest";

import type { AssetsBinding } from "../../runtime/slots.js";
import { assetsContractCases, describeAssetsContract } from "./assets.js";
import { failingCases } from "./case.js";

// A path-keyed map stands in for the runtime's asset layer — `env.ASSETS` on
// Workers, a static directory on a process runtime.
function mapAssets(served: Readonly<Record<string, string>>): AssetsBinding {
  return {
    fetch: (request) => {
      const body = served[new URL(request.url).pathname];
      return Promise.resolve(
        body === undefined
          ? new Response("not found", { status: 404 })
          : new Response(body, { status: 200 }),
      );
    },
  };
}

describeAssetsContract({
  connect: () => mapAssets({ "/_plumix/admin/index.html": "<!doctype html>" }),
  knownPath: "/_plumix/admin/index.html",
});

describe("assets contract cases", () => {
  test("fail a layer that answers every path", async () => {
    const failed = await failingCases(assetsContractCases, {
      connect: () => ({ fetch: () => Promise.resolve(new Response("ok")) }),
      knownPath: "/_plumix/admin/index.html",
    });
    expect(failed).toContain("404s a path the runtime does not hold");
  });

  test("fail a layer that holds nothing", async () => {
    const failed = await failingCases(assetsContractCases, {
      connect: () => mapAssets({}),
      knownPath: "/_plumix/admin/index.html",
    });
    expect(failed).toContain("serves a path the runtime holds");
  });
});
