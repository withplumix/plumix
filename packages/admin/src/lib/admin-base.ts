import { ADMIN_BASE_PATH } from "./constants.js";

/**
 * Read at runtime from the injected `<base href>`, so one precompiled bundle
 * works under any subdirectory. `""` at the domain root.
 */
export function adminBasePath(): string {
  if (typeof document === "undefined") return "";
  // eslint-disable-next-line lingui/no-unlocalized-strings -- DOM selector + attribute, not UI copy
  const href = document.querySelector("base")?.getAttribute("href");
  if (!href) return "";
  // Resolve a possibly-relative href against a throwaway origin; only the
  // pathname matters. Trim the `/_plumix/admin` mount suffix to leave the
  // prefix.
  const path = new URL(href, "http://plumix.invalid/").pathname.replace(
    /\/$/,
    "",
  );
  return path.endsWith(ADMIN_BASE_PATH)
    ? path.slice(0, -ADMIN_BASE_PATH.length)
    : "";
}
