import { describe, expect, test } from "vitest";

import { resolveAssetPath } from "./asset-path.js";

const ROOT = "/srv/site/dist/client";

describe("resolveAssetPath", () => {
  test("names the file a path holds under the root", () => {
    expect(
      resolveAssetPath(ROOT, "/_plumix/admin/assets/index-abc123.js"),
    ).toEqual({
      file: "/srv/site/dist/client/_plumix/admin/assets/index-abc123.js",
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  });

  test("a traversal attempt never leaves the root", () => {
    for (const path of [
      "/../outside.txt",
      "/assets/../../outside.txt",
      "/%2e%2e/outside.txt",
      "/assets/a%5C..%5C..%5Coutside.txt",
      // Joined as is, this would name a sibling of the root.
      "-sibling/outside.txt",
    ]) {
      expect(resolveAssetPath(ROOT, path), path).toBeNull();
    }
  });

  test("dotfiles are refused, .well-known excepted", () => {
    expect(resolveAssetPath(ROOT, "/.env")).toBeNull();
    expect(resolveAssetPath(ROOT, "/nested/.git/config")).toBeNull();
    expect(resolveAssetPath(ROOT, "/.well-known/security.txt")?.file).toBe(
      "/srv/site/dist/client/.well-known/security.txt",
    );
  });

  test("a trailing slash names the directory's index.html", () => {
    expect(resolveAssetPath(ROOT, "/_plumix/admin/")).toEqual({
      file: "/srv/site/dist/client/_plumix/admin/index.html",
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });

  test("a non-ASCII path decodes, and a fragment is stripped", () => {
    expect(resolveAssetPath(ROOT, "/caf%C3%A9.txt")?.file).toBe(
      "/srv/site/dist/client/café.txt",
    );
    expect(resolveAssetPath(ROOT, "/caf%C3%A9.txt#section")?.file).toBe(
      "/srv/site/dist/client/café.txt",
    );
  });

  test("a path decodeURI rejects is not held", () => {
    expect(resolveAssetPath(ROOT, "/%E0%A4%A")).toBeNull();
  });

  test("the content type comes from the extension, case-insensitively, with a binary fallback", () => {
    const type = (path: string) =>
      resolveAssetPath(ROOT, path)?.headers["content-type"];
    expect(type("/logo.SVG")).toBe("image/svg+xml");
    expect(type("/site.webmanifest")).toBe("application/manifest+json");
    expect(type("/archive.tar.gz")).toBe("application/octet-stream");
    expect(type("/LICENSE")).toBe("application/octet-stream");
  });

  test("only the hashed-assets prefix is cached as immutable", () => {
    expect(
      resolveAssetPath(ROOT, "/assets/client-def456.js")?.headers[
        "cache-control"
      ],
    ).toBe("public, max-age=31536000, immutable");
    expect(
      resolveAssetPath(ROOT, "/_plumix/admin/assets/index-abc123.js")?.headers[
        "cache-control"
      ],
    ).toBeUndefined();
  });

  test("a root given with a trailing separator joins the same way", () => {
    expect(resolveAssetPath(`${ROOT}/`, "/robots.txt")?.file).toBe(
      "/srv/site/dist/client/robots.txt",
    );
  });
});
