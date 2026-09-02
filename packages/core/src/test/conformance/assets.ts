import { expect } from "vitest";

import type { AssetsBinding } from "../../runtime/slots.js";
import type { ContractCase } from "./case.js";
import { describeContract } from "./case.js";

const ORIGIN = "https://conformance.test";
const DEFAULT_UNKNOWN_PATH = "/_plumix-conformance/no-such-asset";

export interface AssetsContractOptions {
  /** Bind the runtime's asset layer for one case. */
  readonly connect: () => AssetsBinding | Promise<AssetsBinding>;
  /** A path the layer serves — the staged admin shell's entry, typically. */
  readonly knownPath: string;
  /**
   * A path the layer does not serve. Defaults to a path no build emits; name
   * one when the layer answers unknown paths under a prefix (an SPA fallback).
   */
  readonly unknownPath?: string;
}

type Case = ContractCase<AssetsContractOptions>;

function assetRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

/** Every case of the assets contract, for guard tests that run them outside vitest. */
export const assetsContractCases: readonly Case[] = [
  {
    name: "serves a path the runtime holds",
    run: async (options) => {
      const assets = await options.connect();
      const response = await assets.fetch(assetRequest(options.knownPath));
      expect(response.status).toBe(200);
    },
  },
  {
    name: "404s a path the runtime does not hold",
    run: async (options) => {
      const assets = await options.connect();
      const response = await assets.fetch(
        assetRequest(options.unknownPath ?? DEFAULT_UNKNOWN_PATH),
      );
      expect(response.status).toBe(404);
    },
  },
];

/**
 * Assert a runtime's static-asset layer satisfies the port the core dispatcher
 * delegates admin deep-links to. Call it at the top level of a test file.
 */
export function describeAssetsContract(options: AssetsContractOptions): void {
  describeContract("assets contract", assetsContractCases, options);
}
