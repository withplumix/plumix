import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import type { Root } from "mdast";
import { parse as parseYaml } from "yaml";

import { parseBody } from "./body-shape";

/**
 * Parsed YAML frontmatter. Not JsonObject: the guard below proves only that
 * `parseYaml` returned an object, so no value has been checked — and YAML's
 * core schema reads `.nan` / `.inf` as `NaN` / `Infinity`, which `JSON`
 * cannot carry but TypeScript counts as plain numbers.
 */
type Frontmatter = Readonly<Record<string, unknown>>;

/**
 * What the site does with a file, which decides which checks may hold it to
 * what.
 *
 * - `page` — Starlight publishes it at a URL of its own.
 * - `fragment` — a partial. The collection glob excludes it, so it has no URL
 *   and no page template applies to it; the markdown pipeline still processes
 *   it, and whatever it holds renders inside every page that imports it.
 */
type ContentKind = "page" | "fragment";

/** One content file, read once and shared by every check in the suite. */
export interface ContentFile {
  /** Path relative to the content root, POSIX-separated: `fields/text.mdx`. */
  readonly path: string;
  readonly kind: ContentKind;
  /** Parsed YAML frontmatter; empty when the file carries none. */
  readonly frontmatter: Frontmatter;
  /** Everything below the frontmatter block. */
  readonly body: string;
  /**
   * The body parsed as MDX, or `undefined` when it does not parse — which
   * `checkParsable` reports. Parsed during the traversal rather than by each
   * check, or four checks reading one tree would be four parses of every file.
   */
  readonly mdast: Root | undefined;
}

/**
 * Every extension Starlight's `docsLoader()` publishes, which is wider than
 * the `{md,mdx}` this site's own glob narrows to. Deliberate: the traversal
 * reads the wider set so nothing the pipeline might process escapes the sample
 * check, and `kindOf` decides separately which of them the site publishes.
 */
const MARKDOWN_EXTENSION = /\.(?:markdown|mdown|mkdn|mkd|mdwn|mdx?)$/;

/** The extensions `docsPattern` admits — the `{md,mdx}` half of the glob. */
const PUBLISHED_EXTENSION = /\.mdx?$/;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(?:\r?\n|$)/;

/**
 * Walk a content root once and read every file the markdown pipeline
 * processes. The root is a parameter so the suite can point the checks at
 * fixtures; production points them at `src/content/docs`.
 */
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
 * Whether the collection glob in `src/content.config.ts` would publish this
 * path — the whole glob, not only its underscore half. It excludes any
 * `_`-prefixed segment, file or directory; tinyglobby excludes dot-prefixed
 * ones by default; and it admits only `{md,mdx}`. A file failing any of those
 * has no URL, so the page template cannot apply to it, and the checks that do
 * apply are the ones that read what renders rather than what publishes.
 *
 * Read from the path rather than from where the file sits, so a partial is
 * spotted by the rule that makes it one.
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
