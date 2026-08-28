import type { JsonValue } from "plumix";

/**
 * The characters JSON is happy to emit raw and a browser is not. `<` and `>`
 * let a string close the `<script>` element it is sitting inside; `&` is
 * harmless in script raw text but not everywhere the same bytes travel; and
 * U+2028 / U+2029 are legal in a JSON string yet terminate a line in a script
 * body, which is a parse error rather than a rendering quirk.
 */
const BREAKOUT = /[<>&\u2028\u2029]/g;

/**
 * JSON-LD as it goes into a `<script>` body: every character above rewritten
 * as a `\uXXXX` escape, which is the same string to a JSON reader and inert to
 * an HTML tokenizer.
 */
export function serializeJsonLd(value: JsonValue): string {
  return JSON.stringify(value).replace(
    BREAKOUT,
    (char) =>
      `\\u${char.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}`,
  );
}
