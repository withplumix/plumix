import type { Label } from "../i18n-label.js";

interface CodeLanguage {
  // Stable, lowercase id stored on the block and emitted as
  // `data-language` — highlighters key off these.
  readonly id: string;
  readonly label: Label;
}

// Curated common-language list for the code block's picker. Labels stay
// plain English (proper nouns / not worth translating); ids are the
// canonical highlighter slugs.
export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  { id: "bash", label: "Bash" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "css", label: "CSS" },
  { id: "diff", label: "Diff" },
  { id: "go", label: "Go" },
  { id: "graphql", label: "GraphQL" },
  { id: "html", label: "HTML" },
  { id: "java", label: "Java" },
  { id: "javascript", label: "JavaScript" },
  { id: "jsx", label: "JSX" },
  { id: "json", label: "JSON" },
  { id: "kotlin", label: "Kotlin" },
  { id: "markdown", label: "Markdown" },
  { id: "php", label: "PHP" },
  { id: "python", label: "Python" },
  { id: "ruby", label: "Ruby" },
  { id: "rust", label: "Rust" },
  { id: "shell", label: "Shell" },
  { id: "sql", label: "SQL" },
  { id: "swift", label: "Swift" },
  { id: "toml", label: "TOML" },
  { id: "tsx", label: "TSX" },
  { id: "typescript", label: "TypeScript" },
  { id: "yaml", label: "YAML" },
];

// Short forms / fence names that map onto a canonical id. Anything not
// listed falls through unchanged (lowercased) so an unknown language
// already stored on a block is preserved rather than dropped. Every
// value here must be an id in CODE_LANGUAGES — guarded by a test.
export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  sh: "shell",
  zsh: "shell",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  golang: "go",
};

/**
 * Normalize a raw language string to a canonical id: trim + lowercase,
 * map known aliases, otherwise return the lowercased value verbatim.
 * Empty / whitespace-only / undefined → undefined (no language).
 */
export function normalizeLanguage(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) return undefined;
  return LANGUAGE_ALIASES[trimmed] ?? trimmed;
}
