import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { hashedAssetHeaders } from "./hashed-asset-headers.js";

let publicDir: string;

beforeEach(() => {
  publicDir = mkdtempSync(join(tmpdir(), "plumix-hashed-asset-headers-"));
});

afterEach(() => {
  rmSync(publicDir, { recursive: true, force: true });
});

const PLUMIX_BLOCKS = `/assets/*
  Cache-Control: public, max-age=31536000, immutable

/_plumix/admin/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;

/** The `_headers` a client build writes, as its bundle emits it. */
function builtHeaders(): string {
  const plugin = hashedAssetHeaders();
  plugin.configResolved({ publicDir });
  const emitted: { fileName: string; source: string }[] = [];
  plugin.generateBundle.call({
    emitFile: (file) => {
      emitted.push(file);
      return file.fileName;
    },
  });
  const [file] = emitted;
  if (emitted.length !== 1 || file?.fileName !== "_headers") {
    throw new Error("the build did not emit one _headers file");
  }
  return file.source;
}

describe("the _headers a Cloudflare build writes", () => {
  test("holds exactly the immutable blocks when the site ships none", () => {
    expect(builtHeaders()).toBe(PLUMIX_BLOCKS);
  });

  test("puts the immutable blocks first and ends with the site's rules byte for byte", () => {
    const site = "/*\n  X-Frame-Options: DENY\n\n/fonts/*\r\n  ! Cache-Control";
    writeFileSync(join(publicDir, "_headers"), site);

    const headers = builtHeaders();

    expect(headers.endsWith(site)).toBe(true);
    expect(headers.slice(0, -site.length)).toBe(`${PLUMIX_BLOCKS}\n`);
  });

  test("fails the build when the site's _headers cannot be read, rather than drop its rules", () => {
    mkdirSync(join(publicDir, "_headers"));

    expect(builtHeaders).toThrow(/EISDIR/);
  });

  test("writes only to the client environment, whose output is the static assets", () => {
    const plugin = hashedAssetHeaders();

    expect(plugin.applyToEnvironment({ name: "client" })).toBe(true);
    expect(plugin.applyToEnvironment({ name: "my_site" })).toBe(false);
  });
});
