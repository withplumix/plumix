import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HASHED_ASSET_PREFIXES } from "plumix/runtime";

const HEADERS_FILE = "_headers";

/**
 * Workers static assets serve every file `max-age=0, must-revalidate` unless
 * `_headers` says otherwise, and a request for one never reaches the Worker.
 */
const PLUMIX_BLOCKS = HASHED_ASSET_PREFIXES.map(
  (prefix) =>
    `${prefix}*\n  Cache-Control: public, max-age=31536000, immutable\n`,
).join("\n");

interface EmittedAsset {
  readonly type: "asset";
  readonly fileName: string;
  readonly source: string;
}

export interface HashedAssetHeadersPlugin {
  readonly name: string;
  applyToEnvironment(environment: { readonly name: string }): boolean;
  configResolved(config: { readonly publicDir: string }): void;
  generateBundle(this: { emitFile(file: EmittedAsset): string }): void;
}

/**
 * Replaces the `_headers` Vite copied from `public/`. Site rules go last: `!`
 * detaches only what an earlier rule set
 * (https://developers.cloudflare.com/workers/static-assets/headers/).
 */
export function hashedAssetHeaders(): HashedAssetHeadersPlugin {
  let publicDir = "";
  return {
    name: "plumix:cloudflare-hashed-asset-headers",
    applyToEnvironment: (environment) => environment.name === "client",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle() {
      const site = readSiteHeaders(publicDir);
      this.emitFile({
        type: "asset",
        fileName: HEADERS_FILE,
        source: site === null ? PLUMIX_BLOCKS : `${PLUMIX_BLOCKS}\n${site}`,
      });
    },
  };
}

function readSiteHeaders(publicDir: string): string | null {
  try {
    return readFileSync(join(publicDir, HEADERS_FILE), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
