import DOMPurify from "dompurify";

/**
 * Drop-in replacement for the subset of `sanitize-html` that `sanitizeHtml`
 * (./sanitize.ts) calls. This package's `browser` field remaps `sanitize-html`
 * to this module, so bundlers targeting the browser (the editor + islands
 * chunks) ship DOMPurify (~45 KB, native DOMParser) instead of sanitize-html's
 * pure-JS parser, the full HTML entity tables, and postcss (~230 KB). The
 * worker/SSR build is DOM-less and keeps the real `sanitize-html`.
 *
 * Security parity is the contract: for a given allowlist this must enforce the
 * same guarantees as the server engine — same tags, same per-tag attributes,
 * same URL-scheme policy. Verified by dompurify-shim.test.ts against the same
 * attack corpus as the server engine.
 */
interface SanitizeOptions {
  readonly allowedTags?: readonly string[];
  /** Per-tag attribute allowlist, keyed by lowercase tag name. */
  readonly allowedAttributes?: Readonly<Record<string, readonly string[]>>;
  readonly allowedSchemes?: readonly string[];
  readonly allowProtocolRelative?: boolean;
}

const DEFAULT_SCHEMES = ["http", "https", "mailto", "tel"];

// Attributes whose value is a URL and therefore subject to the scheme policy.
// The per-tag allowlist already drops everything else; this is the set we
// additionally scheme-check when an attribute IS allowed for its tag.
const URI_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "poster",
  "data",
]);

/**
 * Mirror sanitize-html's URL policy: relative URLs (path / `#frag` / `?query`)
 * pass; protocol-relative `//host` passes only when allowed; absolute URLs pass
 * only when their scheme is allowlisted. The DOM has already entity-decoded the
 * value, so obfuscation like `javas&#99;ript:` arrives as `javascript:`; we
 * additionally strip control/whitespace chars browsers ignore so `java\tscript:`
 * can't smuggle a scheme past the check.
 */
function isAllowedUri(
  value: string,
  schemes: readonly string[],
  allowProtocolRelative: boolean,
): boolean {
  // eslint-disable-next-line no-control-regex -- strip C0 controls + space browsers ignore in URLs
  const normalized = value.replace(/[\u0000-\u0020]+/g, "").toLowerCase();
  if (normalized === "") return true;
  if (normalized.startsWith("//")) return allowProtocolRelative;
  const proto = /^([a-z][a-z0-9+.-]*):/.exec(normalized)?.[1];
  if (proto === undefined) return true; // no scheme matched → relative URL
  return schemes.includes(proto);
}

export default function sanitize(
  dirty: unknown,
  options: SanitizeOptions = {},
): string {
  if (typeof dirty !== "string" || dirty === "") return "";

  const allowedTags = [...(options.allowedTags ?? [])];
  const perTag = options.allowedAttributes ?? {};
  const schemes = (options.allowedSchemes ?? DEFAULT_SCHEMES).map((s) =>
    s.toLowerCase(),
  );
  const allowProtocolRelative = options.allowProtocolRelative ?? false;

  // DOMPurify's ALLOWED_ATTR is a flat (tag-agnostic) set; the union here is
  // only the coarse pass. The hook below does the authoritative per-tag check.
  const attrUnion = new Set<string>();
  const perTagLower: Record<string, Set<string>> = {};
  for (const [tag, attrs] of Object.entries(perTag)) {
    const set = new Set(attrs.map((a) => a.toLowerCase()));
    perTagLower[tag.toLowerCase()] = set;
    for (const a of set) attrUnion.add(a);
  }

  const hook = (
    node: Element,
    data: { attrName: string; attrValue: string; keepAttr: boolean },
  ): void => {
    const tag = node.tagName.toLowerCase();
    const attr = data.attrName.toLowerCase();
    const allowed = perTagLower[tag];
    if (!allowed?.has(attr)) {
      data.keepAttr = false;
      return;
    }
    if (
      URI_ATTRS.has(attr) &&
      !isAllowedUri(data.attrValue, schemes, allowProtocolRelative)
    ) {
      data.keepAttr = false;
    }
  };

  // The hook is global on the DOMPurify singleton. Safe because every caller
  // runs this synchronously from React render and DOMPurify.sanitize is
  // synchronous, so add → sanitize → remove is atomic; `finally` restores
  // state even if a vector makes the hook throw. Don't call sanitizeHtml
  // re-entrantly from inside a hook — that would tear down this registration.
  DOMPurify.addHook("uponSanitizeAttribute", hook);
  try {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: [...attrUnion],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    });
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute");
  }
}
