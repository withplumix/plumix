import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import type { Root } from "mdast";
import { parse as parseYaml } from "yaml";

import { parseBody } from "./body-shape";

/**
 * Not JsonObject: values are unchecked, and YAML reads `.nan` / `.inf` as `NaN`
 * / `Infinity`, which JSON cannot carry.
 */
type Frontmatter = Readonly<Record<string, unknown>>;

/**
 * A `fragment` has no URL, so no page template applies, but it still renders
 * inside every page that imports it.
 */
type ContentKind = "page" | "fragment";

/** One content file, read once and shared by every check in the suite. */
export interface ContentFile {
  /** POSIX-separated, relative to the content root: `fields/text.mdx`. */
  readonly path: string;
  readonly kind: ContentKind;
  /** Parsed YAML frontmatter; empty when the file carries none. */
  readonly frontmatter: Frontmatter;
  /** Everything below the frontmatter block. */
  readonly body: string;
  /**
   * `undefined` when the body does not parse as MDX. Parsed once, shared by
   * every check.
   */
  readonly mdast: Root | undefined;
}

/**
 * Wider than the site's `{md,mdx}` glob on purpose: matches Starlight's
 * `docsLoader()` so nothing the pipeline processes escapes the sample check.
 */
const MARKDOWN_EXTENSION = /\.(?:markdown|mdown|mkdn|mkd|mdwn|mdx?)$/;

const PUBLISHED_EXTENSION = /\.mdx?$/;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(?:\r?\n|$)/;

export function readContentTree(root: string): ContentFile[] {
  return collect(root, "").map((relativePath) => {
    const { frontmatter, body } = split(
      readFileSync(join(root, relativePath), "utf8"),
    );

    return {
      path: relativePath,
      kind: kindOf(relativePath),
      frontmatter,
      body,
      mdast: parseBody(body),
    };
  });
}

function collect(root: string, prefix: string): string[] {
  const entries = readdirSync(join(root, prefix), {
    withFileTypes: true,
  }).sort((a, b) => (a.name < b.name ? -1 : 1));

  return entries.flatMap((entry) => {
    const relativePath = posix.join(prefix, entry.name);
    if (entry.isDirectory()) return collect(root, relativePath);
    return MARKDOWN_EXTENSION.test(entry.name) ? [relativePath] : [];
  });
}

/**
 * Mirrors the collection glob in `src/content.config.ts`: it excludes
 * `_`-prefixed segments, tinyglobby excludes dot-prefixed ones by default, and
 * only `{md,mdx}` publish.
 */
function kindOf(relativePath: string): ContentKind {
  const segments = relativePath.split("/");
  const excluded = segments.some(
    (segment) => segment.startsWith("_") || segment.startsWith("."),
  );

  return excluded || !PUBLISHED_EXTENSION.test(relativePath)
    ? "fragment"
    : "page";
}

function split(source: string): Pick<ContentFile, "frontmatter" | "body"> {
  const match = FRONTMATTER.exec(source);
  if (match === null) return { frontmatter: {}, body: source };

  const parsed: unknown = parseYaml(match[1]);
  return {
    frontmatter: isRecord(parsed) ? parsed : {},
    body: source.slice(match[0].length),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
