import DOMPurify from "dompurify";

// The `browser` field swaps `sanitize-html` (~230 KB) for this in browser
// bundles. It must enforce exactly the server engine's tags, per-tag attributes
// and URL-scheme policy.
interface SanitizeOptions {
  readonly allowedTags?: readonly string[];
  readonly allowedAttributes?: Readonly<Record<string, readonly string[]>>;
  readonly allowedSchemes?: readonly string[];
  readonly allowProtocolRelative?: boolean;
}

const DEFAULT_SCHEMES = ["http", "https", "mailto", "tel"];

// Scheme-checked even when the attribute is allowed for its tag.
const URI_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "poster",
  "data",
]);

// Mirrors sanitize-html's URL policy. Control and whitespace chars browsers
// ignore are stripped so `java\tscript:` can't smuggle a scheme past the check.
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

  // The hook is global on the singleton; add → sanitize → remove is atomic
  // because all of it is synchronous. Re-entrant calls would tear it down.
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
