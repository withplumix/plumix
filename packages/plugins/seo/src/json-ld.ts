import type { JsonValue } from "plumix";

/**
 * `<` and `>` can close the `<script>`; U+2028/U+2029 are legal JSON but end a
 * line in a script body, a parse error.
 */
const BREAKOUT = /[<>&\u2028\u2029]/g;

/**
 * Escapes HTML-significant characters as `\uXXXX`: the same string to a JSON
 * reader, inert inside a `<script>` body.
 */
export function serializeJsonLd(value: JsonValue): string {
  return JSON.stringify(value).replace(
    BREAKOUT,
    (char) =>
      `\\u${char.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}`,
  );
}
