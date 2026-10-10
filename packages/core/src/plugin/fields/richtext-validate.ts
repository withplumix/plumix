// Rejects rather than strips disallowed nodes: stripping would silently hide
// edits, and a loud reject keeps the editor's and server's allowlists in
// lockstep.

import * as v from "valibot";

/**
 * `looseObject` keeps `content` / `marks` / `attrs` reachable without this
 * schema claiming anything about them.
 */
const typedNodeSchema = v.looseObject({
  type: v.pipe(v.string(), v.nonEmpty()),
});

/**
 * Structural nodes the editor emits regardless of `.nodes()`. None can carry a
 * script or href, so admitting them implicitly is safe.
 */
const IMPLICIT_NODES: ReadonlySet<string> = new Set([
  "doc",
  "paragraph",
  "text",
  "hardBreak",
  "listItem",
]);

function expandAliases(allowlist: readonly string[]): readonly string[] {
  return allowlist;
}

/**
 * Final href gate. Mirrors the regex in `route/render/tiptap.ts`'s
 * `sanitizeHref` — keep them in sync. Blocks `javascript:`, `data:`,
 * `vbscript:`, `file:` and their variants. Fragment / query-only /
 * relative refs pass.
 */
export const SAFE_HREF_RE = /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i;

/**
 * The 256 KiB byte cap alone admits ~8.5k levels, enough to blow the stack;
 * real documents rarely nest past 10.
 */
const MAX_RICHTEXT_DEPTH = 100;

interface RichtextAllowlist {
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
}

/**
 * Throws `RichtextValidationError` on the first violation; otherwise returns
 * the input unchanged.
 */
export function walkRichtextDoc(
  allowlist: RichtextAllowlist,
): <T>(value: T) => T {
  // Pre-build the type sets so the recursive walker doesn't re-build
  // them on every node.
  const allowedNodeTypes = new Set<string>([
    ...IMPLICIT_NODES,
    ...expandAliases(allowlist.nodes ?? []),
    ...expandAliases(allowlist.blocks ?? []),
  ]);
  const allowedMarkTypes = new Set<string>([
    // `MarkSpec` has no `legacyAliases` today so `expandAliases` is a
    // no-op for marks — kept symmetric for the eventual mark namespacing.
    ...expandAliases(allowlist.marks ?? []),
    ...expandAliases(allowlist.blocks ?? []),
  ]);
  return (value) => {
    if (value === null || value === undefined) return value;
    walkNode(value, "", 0, allowedNodeTypes, allowedMarkTypes);
    return value;
  };
}

type RichtextValidationReason =
  "disallowed_node" | "disallowed_mark" | "unsafe_href" | "invalid_shape";

/** `path` locates the offender, e.g. `"content[2].content[0].marks[1]"`. */
export class RichtextValidationError extends Error {
  static {
    RichtextValidationError.prototype.name = "RichtextValidationError";
  }

  readonly path: string;
  readonly reason: RichtextValidationReason;

  private constructor(
    reason: RichtextValidationReason,
    path: string,
    message: string,
  ) {
    super(message);
    this.path = path;
    this.reason = reason;
  }

  static nestingExceeded(ctx: {
    path: string;
    maxDepth: number;
  }): RichtextValidationError {
    return new RichtextValidationError(
      "invalid_shape",
      ctx.path,
      `richtext nesting exceeds ${String(ctx.maxDepth)} levels`,
    );
  }

  static nodeNotPlainObject(ctx: { path: string }): RichtextValidationError {
    return new RichtextValidationError(
      "invalid_shape",
      ctx.path,
      "richtext node must be a plain object",
    );
  }

  static nodeMissingType(ctx: { path: string }): RichtextValidationError {
    return new RichtextValidationError(
      "invalid_shape",
      ctx.path,
      "richtext node missing string `type`",
    );
  }

  static disallowedNode(ctx: {
    path: string;
    nodeType: string;
  }): RichtextValidationError {
    return new RichtextValidationError(
      "disallowed_node",
      ctx.path,
      `richtext node type "${ctx.nodeType}" not in field allowlist`,
    );
  }

  static markNotPlainObject(ctx: { path: string }): RichtextValidationError {
    return new RichtextValidationError(
      "invalid_shape",
      ctx.path,
      "richtext mark must be a plain object",
    );
  }

  static markMissingType(ctx: { path: string }): RichtextValidationError {
    return new RichtextValidationError(
      "invalid_shape",
      ctx.path,
      "richtext mark missing string `type`",
    );
  }

  static disallowedMark(ctx: {
    path: string;
    markType: string;
  }): RichtextValidationError {
    return new RichtextValidationError(
      "disallowed_mark",
      ctx.path,
      `richtext mark type "${ctx.markType}" not in field allowlist`,
    );
  }

  static unsafeHref(ctx: {
    path: string;
    hrefType: string;
  }): RichtextValidationError {
    // `href` shape is unknown; describe by typeof so we don't tempt a
    // `[object Object]` stringification in the error.
    return new RichtextValidationError(
      "unsafe_href",
      ctx.path,
      `richtext link mark href (${ctx.hrefType}) is not a safe URL`,
    );
  }
}

function walkNode(
  value: unknown,
  path: string,
  depth: number,
  allowedNodeTypes: ReadonlySet<string>,
  allowedMarkTypes: ReadonlySet<string>,
): void {
  const normalizedPath = path === "" ? "<root>" : path;
  if (depth > MAX_RICHTEXT_DEPTH) {
    throw RichtextValidationError.nestingExceeded({
      path: normalizedPath,
      maxDepth: MAX_RICHTEXT_DEPTH,
    });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw RichtextValidationError.nodeNotPlainObject({ path: normalizedPath });
  }
  const parsed = v.safeParse(typedNodeSchema, value);
  if (!parsed.success) {
    throw RichtextValidationError.nodeMissingType({ path: normalizedPath });
  }
  const node = parsed.output;
  if (!allowedNodeTypes.has(node.type)) {
    throw RichtextValidationError.disallowedNode({
      path: normalizedPath,
      nodeType: node.type,
    });
  }
  if (Array.isArray(node.marks)) {
    node.marks.forEach((mark, i) => {
      walkMark(mark, `${path}.marks[${i}]`, allowedMarkTypes);
    });
  }
  if (Array.isArray(node.content)) {
    node.content.forEach((child, i) => {
      walkNode(
        child,
        `${path}.content[${i}]`,
        depth + 1,
        allowedNodeTypes,
        allowedMarkTypes,
      );
    });
  }
}

function walkMark(
  value: unknown,
  path: string,
  allowedMarkTypes: ReadonlySet<string>,
): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw RichtextValidationError.markNotPlainObject({ path });
  }
  const parsed = v.safeParse(typedNodeSchema, value);
  if (!parsed.success) {
    throw RichtextValidationError.markMissingType({ path });
  }
  const mark = parsed.output;
  if (!allowedMarkTypes.has(mark.type)) {
    throw RichtextValidationError.disallowedMark({
      path,
      markType: mark.type,
    });
  }
  // `link.href` reaches rendered HTML, and a direct API write bypasses the
  // admin's allowlist.
  if (mark.type === "link" && mark.attrs && typeof mark.attrs === "object") {
    const attrs = mark.attrs as Readonly<Record<string, unknown>>;
    const href = attrs.href;
    if (href !== undefined && href !== null && href !== "") {
      if (typeof href !== "string" || !SAFE_HREF_RE.test(href.trim())) {
        throw RichtextValidationError.unsafeHref({
          path,
          hrefType: typeof href,
        });
      }
    }
  }
}
