import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Parsed YAML frontmatter. Not JsonObject: the guard below proves only that
 * `parseYaml` returned an object, so no value has been checked — and YAML's
 * core schema reads `.nan` / `.inf` as `NaN` / `Infinity`, which `JSON`
 * cannot carry but TypeScript counts as plain numbers.
 */
type Frontmatter = Readonly<Record<string, unknown>>;

/** One page, read once and shared by every check in the suite. */
export interface ContentPage {
  /** Path relative to the content root, POSIX-separated: `fields/text.mdx`. */
  readonly path: string;
  /** Parsed YAML frontmatter; empty when the page carries none. */
  readonly frontmatter: Frontmatter;
  /** Everything below the frontmatter block. */
  readonly body: string;
}

/**
 * Every extension Starlight's `docsLoader()` publishes. Matching its list
 * rather than the house `.mdx` rule is deliberate: a page the site renders but
 * the traversal skips would escape every check in this suite.
 */
const PAGE_EXTENSION = /\.(?:markdown|mdown|mkdn|mkd|mdwn|mdx?)$/;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(?:\r?\n|$)/;

/**
 * Walk a content root once and read every page under it. The root is a
 * parameter so the suite can point the checks at fixtures; production points
 * them at `src/content/docs`.
 */
export function readContentTree(root: string): ContentPage[] {
  return collect(root, "").map((relativePath) => ({
    path: relativePath,
    ...split(readFileSync(join(root, relativePath), "utf8")),
  }));
}

function collect(root: string, prefix: string): string[] {
  const entries = readdirSync(join(root, prefix), { withFileTypes: true })
    // Starlight's collection glob excludes `_`-prefixed paths, so partials are
    // not pages and no page template applies to them.
    .filter((entry) => !entry.name.startsWith("_"))
    .sort((a, b) => (a.name < b.name ? -1 : 1));

  return entries.flatMap((entry) => {
    const relativePath = posix.join(prefix, entry.name);
    if (entry.isDirectory()) return collect(root, relativePath);
    return PAGE_EXTENSION.test(entry.name) ? [relativePath] : [];
  });
}

function split(source: string): Omit<ContentPage, "path"> {
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
