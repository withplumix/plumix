import { describe, expect, test } from "vitest";

import type { AssetsBinding } from "../../runtime/slots.js";
import type { AssetsNotFound } from "./assets.js";
import { assetsContractCases, describeAssetsContract } from "./assets.js";
import { failingCases } from "./case.js";

const SHELL = "<!doctype html><title>admin</title>";
const CHUNK = "export const admin = 1;";
const SHELL_PATH = "/_plumix/admin/";
const ASSET_PATH = "/_plumix/admin/assets/index-abc123.js";

const HELD_FILES: Readonly<Record<string, { body: string; type: string }>> = {
  [SHELL_PATH]: { body: SHELL, type: "text/html; charset=utf-8" },
  [ASSET_PATH]: { body: CHUNK, type: "text/javascript" },
};

// A path-keyed map stands in for the runtime's asset layer — `env.ASSETS` on
// Workers, a static directory on a process runtime. `notFound` picks which of
// the two documented behaviours it models.
function mapAssets(notFound: AssetsNotFound): AssetsBinding {
  return {
    fetch: (request) => {
      const file = HELD_FILES[new URL(request.url).pathname];
      if (file) {
        return Promise.resolve(
          new Response(file.body, {
            status: 200,
            headers: { "content-type": file.type },
          }),
        );
      }
      return Promise.resolve(
        notFound === "spa"
          ? new Response(SHELL, {
              status: 200,
              headers: { "content-type": "text/html; charset=utf-8" },
            })
          : new Response("not found", { status: 404 }),
      );
    },
  };
}

describeAssetsContract({
  connect: () => mapAssets("spa"),
  assetPath: ASSET_PATH,
  shellPath: SHELL_PATH,
  notFound: "spa",
});

describeAssetsContract({
  connect: () => mapAssets("404"),
  assetPath: ASSET_PATH,
  shellPath: SHELL_PATH,
  notFound: "404",
});

describe("assets contract cases", () => {
  test("fail a layer that answers every path with the shell but declares 404s", async () => {
    const failed = await failingCases(assetsContractCases, {
      connect: () => mapAssets("spa"),
      assetPath: ASSET_PATH,
      shellPath: SHELL_PATH,
      notFound: "404",
    });
    expect(failed).toContain("a path the runtime does not hold 404s");
  });

  test("fail a layer that labels every file as HTML", async () => {
    const failed = await failingCases(assetsContractCases, {
      connect: () => ({
        fetch: () =>
          Promise.resolve(
            new Response(SHELL, { headers: { "content-type": "text/html" } }),
          ),
      }),
      assetPath: ASSET_PATH,
      shellPath: SHELL_PATH,
      notFound: "spa",
    });
    expect(failed).toContain(
      "serves a file it holds, as itself rather than as the shell",
    );
  });

  test("fail a layer whose shell path does not resolve", async () => {
    const failed = await failingCases(assetsContractCases, {
      connect: () => mapAssets("404"),
      assetPath: ASSET_PATH,
      shellPath: "/_plumix/admin/index.html",
      notFound: "404",
    });
    expect(failed).toContain("the shell path answers with an HTML document");
  });
});
