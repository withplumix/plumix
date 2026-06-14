import { ADMIN_BASE_PATH } from "./constants.js";

/**
 * The subdirectory the admin is mounted under (`""` at the domain root,
 * `/custom-directory` behind a subdirectory proxy), derived at runtime from the
 * `<base href>` the worker injects into the admin shell. Lets the same
 * precompiled admin bundle address the right router / RPC paths without a
 * rebuild — the client-side half of plumix's `basePath` support.
 */
export function adminBasePath(): string {
  if (typeof document === "undefined") return "";
  // eslint-disable-next-line lingui/no-unlocalized-strings -- DOM selector + attribute, not UI copy
  const href = document.querySelector("base")?.getAttribute("href");
  if (!href) return "";
  // Resolve a possibly-relative href against a throwaway origin; only the
  // pathname matters. Trim the `/_plumix/admin` mount suffix to leave the prefix.
  const path = new URL(href, "http://plumix.invalid/").pathname.replace(
    /\/$/,
    "",
  );
  return path.endsWith(ADMIN_BASE_PATH)
    ? path.slice(0, -ADMIN_BASE_PATH.length)
    : "";
}
