import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

// highlight.js core + only the grammars for the curated `CODE_LANGUAGES`, so
// the bundle carries no more than the block can produce. Runs identically at
// SSR (public, zero client JS — the block isn't an island) and in the editor
// canvas (live re-highlight when the language changes).
for (const [name, grammar] of [
  ["bash", bash],
  ["c", c],
  ["cpp", cpp],
  ["csharp", csharp],
  ["css", css],
  ["diff", diff],
  ["go", go],
  ["graphql", graphql],
  ["ini", ini],
  ["java", java],
  ["javascript", javascript],
  ["json", json],
  ["kotlin", kotlin],
  ["markdown", markdown],
  ["php", php],
  ["python", python],
  ["ruby", ruby],
  ["rust", rust],
  ["shell", shell],
  ["sql", sql],
  ["swift", swift],
  ["typescript", typescript],
  ["xml", xml],
  ["yaml", yaml],
] as const) {
  hljs.registerLanguage(name, grammar);
}

// Canonical ids highlight.js keys under a different (or shared) grammar.
const LANGUAGE_TO_GRAMMAR: Readonly<Record<string, string>> = {
  html: "xml",
  toml: "ini",
  jsx: "javascript",
  tsx: "typescript",
};

/**
 * Highlight `code` for a normalized language id, returning the inner HTML of
 * the `<code>` element (highlight.js escapes the source and wraps tokens in
 * `hljs-*` spans). Returns `null` for a language no grammar covers, so the
 * caller falls back to plain text.
 */
export function highlightCode(code: string, language: string): string | null {
  const grammar = LANGUAGE_TO_GRAMMAR[language] ?? language;
  if (!hljs.getLanguage(grammar)) return null;
  return hljs.highlight(code, { language: grammar, ignoreIllegals: true })
    .value;
}

// Token colours for the `hljs-*` classes, as theme-overridable CSS variables
// (`var(--plumix-code-*, fallback)`) — the same override model as block
// defaultStyles. Emitted once alongside a highlighted block so the styles
// travel with the markup into both the editor iframe and the public page,
// with no separate stylesheet to coordinate.
export const CODE_THEME_CSS = [
  ".hljs{color:var(--plumix-code-fg,#24292e)}",
  ".hljs-comment,.hljs-quote{color:var(--plumix-code-comment,#6a737d);font-style:italic}",
  ".hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-type,.hljs-built_in{color:var(--plumix-code-keyword,#d73a49)}",
  ".hljs-string,.hljs-regexp,.hljs-doctag{color:var(--plumix-code-string,#032f62)}",
  ".hljs-number,.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable{color:var(--plumix-code-number,#005cc5)}",
  ".hljs-title,.hljs-section,.hljs-name,.hljs-selector-id,.hljs-selector-class{color:var(--plumix-code-title,#6f42c1)}",
  ".hljs-tag{color:var(--plumix-code-tag,#22863a)}",
  ".hljs-meta{color:var(--plumix-code-meta,#6a737d)}",
  ".hljs-symbol,.hljs-bullet,.hljs-link{color:var(--plumix-code-symbol,#e36209)}",
  ".hljs-emphasis{font-style:italic}",
  ".hljs-strong{font-weight:600}",
].join("");
