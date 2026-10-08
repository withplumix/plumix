import { readFileSync } from "node:fs";

import type { CompiledCatalog } from "../blocks/index.js";
import type { PluginCatalogs } from "../route/render/block-catalog.js";

const ENTRY =
  /^msgid ((?:"(?:[^"\\\n]|\\.)*"(?:\n|$))+)msgstr ((?:"(?:[^"\\\n]|\\.)*"(?:\n|$))+)/gm;
const PLACEHOLDER = /\{(\w+)\}/g;

// A `.po` string is one or more quoted lines, concatenated.
function unquote(lines: string): string {
  return [...lines.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map((match) => match[1] ?? "")
    .join("")
    .replace(/\\(.)/g, (_, char: string) => (char === "n" ? "\n" : char));
}

// `Hello {name}` → `["Hello ", ["name"]]`, the token array `lingui compile`
// emits for a message with a placeholder.
function compile(message: string): CompiledCatalog[string] {
  if (!message.includes("{")) return message;
  const tokens: (string | readonly string[])[] = [];
  let last = 0;
  for (const match of message.matchAll(PLACEHOLDER)) {
    if (match.index > last) tokens.push(message.slice(last, match.index));
    tokens.push([match[1] ?? ""]);
    last = match.index + match[0].length;
  }
  if (last < message.length) tokens.push(message.slice(last));
  return tokens;
}

/**
 * A committed `.po` catalog in the shape `lingui compile` emits. Unit tests
 * resolve every compiled `locales/*` import to an empty catalog, so a test of
 * translated output reads the catalog it shipped. Only `{name}` placeholders
 * compile; an untranslated entry is left out, as compile leaves it to the
 * source.
 */
export function catalogFromPo(path: URL): CompiledCatalog {
  const po = readFileSync(path, "utf8");
  const catalog: Record<string, CompiledCatalog[string]> = {};
  for (const [, id, message] of po.matchAll(ENTRY)) {
    const source = unquote(id ?? "");
    const translated = unquote(message ?? "");
    if (source === "" || translated === "") continue;
    catalog[source] = compile(translated);
  }
  return catalog;
}

/** One `.po` per locale, as the plugin catalogs a harness takes. */
export function poCatalogs(
  files: Readonly<Record<string, URL>>,
): PluginCatalogs {
  return Object.fromEntries(
    Object.entries(files).map(([locale, path]) => [
      locale,
      [() => Promise.resolve({ messages: catalogFromPo(path) })],
    ]),
  );
}
