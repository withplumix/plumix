import { expect } from "vitest";

import type { AssetsBinding } from "../../runtime/slots.js";
import type { ContractCase } from "./case.js";
import { describeContract } from "./case.js";

const ORIGIN = "https://conformance.test";
const UNHELD_PATH = "/_plumix-conformance/no-such-asset";

/**
 * What a layer does with a path it does not hold. Both are real Cloudflare
 * deploys: `"404"` is Workers Assets under `not_found_handling: "none"`, which
 * the scaffold ships so an unmatched path reaches the Worker; `"spa"` is the
 * `single-page-application` handling several plugin playgrounds use, where the
 * layer answers with the shell instead.
 */
export type AssetsNotFound = "404" | "spa";

export interface AssetsContractOptions {
  /** Bind the runtime's asset layer for one case. */
  readonly connect: () => AssetsBinding | Promise<AssetsBinding>;
  /**
   * A path the layer holds as a file — a hashed chunk, a stylesheet, a font.
   * Not the shell: one case asserts this comes back as itself rather than as
   * HTML, which is how the dispatcher tells an asset from a deep link.
   */
  readonly assetPath: string;
  /**
   * The request that resolves to the admin shell — the mount prefix with its
   * trailing slash, which is what the dispatcher fetches for a deep link.
   * Not optional: a layer that cannot answer it cannot serve the admin.
   */
  readonly shellPath: string;
  /** How the layer answers a path it does not hold. */
  readonly notFound: AssetsNotFound;
}

type Case = ContractCase<AssetsContractOptions>;

function assetRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

function isHtml(response: Response): boolean {
  return (
    response.headers.get("content-type")?.toLowerCase().includes("text/html") ??
    false
  );
}

async function fetchUnknown(options: AssetsContractOptions): Promise<Response> {
  const assets = await options.connect();
  return await assets.fetch(assetRequest(UNHELD_PATH));
}

/** Every case of the assets contract, for guard tests that run them outside vitest. */
export const assetsContractCases: readonly Case[] = [
  {
    name: "serves a file it holds, as itself rather than as the shell",
    run: async (options) => {
      const assets = await options.connect();
      const response = await assets.fetch(assetRequest(options.assetPath));
      expect(response.status).toBe(200);
      // Under a subdirectory mount the dispatcher hands this response straight
      // to the browser, so a layer that labels a chunk `text/html` breaks the
      // module loader. Asserting the type also keeps the case meaningful for a
      // layer whose not-found answer is the shell, where a bare 200 says
      // nothing.
      expect(isHtml(response)).toBe(false);
    },
  },
  {
    name: "the shell path answers with an HTML document",
    run: async (options) => {
      const assets = await options.connect();
      // `<prefix>/`, not `<prefix>/index.html`: under SPA handling the latter
      // redirects to the trailing-slash form, and the dispatcher would hand
      // the visitor a redirect instead of the admin.
      const response = await assets.fetch(assetRequest(options.shellPath));
      expect(response.status).toBe(200);
      expect(isHtml(response)).toBe(true);
    },
  },
  {
    name: "a path the runtime does not hold 404s",
    skip: (options) =>
      options.notFound === "404"
        ? null
        : "the factory declares single-page-application handling",
    run: async (options) => {
      expect((await fetchUnknown(options)).status).toBe(404);
    },
  },
  {
    name: "a path the runtime does not hold falls back to the shell",
    skip: (options) =>
      options.notFound === "spa" ? null : "the factory declares 404 handling",
    run: async (options) => {
      const response = await fetchUnknown(options);
      expect(response.status).toBe(200);
      expect(isHtml(response)).toBe(true);
    },
  },
];

/**
 * Assert a runtime's static-asset layer satisfies the port the core dispatcher
 * delegates admin deep-links to. Call it at the top level of a test file.
 */
export function describeAssetsContract(options: AssetsContractOptions): void {
  // The mode is in the name because a file may run both, and a bare "assets
  // contract" twice over says nothing about which one went red.
  describeContract(
    `assets contract (${options.notFound})`,
    assetsContractCases,
    options,
  );
}
