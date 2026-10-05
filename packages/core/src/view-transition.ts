/**
 * The transition types core adds to a navigation's view transition, one per
 * direction, for theme and admin CSS to match with
 * `:active-view-transition-type()`.
 */
export const viewTransitionTypes = {
  forward: "nav-forward",
  back: "nav-back",
  replace: "nav-replace",
} as const;

export type ViewTransitionType =
  (typeof viewTransitionTypes)[keyof typeof viewTransitionTypes];

/**
 * A `view-transition-name` for the element `key` identifies within `prefix`'s
 * group, e.g. `transitionName("post-title", entry.slug)`. The result is always
 * one CSS `<custom-ident>`: both parts are escaped, and the `_` between them
 * keeps the name from ever reading as a reserved word (`none`, `auto`,
 * `match-element`, the CSS-wide keywords), which the browser would drop
 * silently. Pure and DOM-free, so server and client produce the same name.
 */
export function transitionName(prefix: string, key: string): string {
  return serializeIdentifier(`${prefix}_${key}`);
}

// CSSOM "serialize an identifier" (https://drafts.csswg.org/cssom/#serialize-an-identifier),
// written out because `CSS.escape` exists only in a browser.
function serializeIdentifier(value: string): string {
  let out = "";
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    const char = value.charAt(index);
    const isDigit = code >= 0x30 && code <= 0x39;
    const startsWithHyphen = value.charCodeAt(0) === 0x2d;
    if (code === 0) {
      out += "�";
    } else if (
      (code >= 0x1 && code <= 0x1f) ||
      code === 0x7f ||
      (index === 0 && isDigit) ||
      (index === 1 && isDigit && startsWithHyphen)
    ) {
      out += `\\${code.toString(16)} `;
    } else if (index === 0 && char === "-" && value.length === 1) {
      out += `\\${char}`;
    } else if (code >= 0x80 || /[-_0-9A-Za-z]/.test(char)) {
      out += char;
    } else {
      out += `\\${char}`;
    }
  }
  return out;
}
