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
 * The `_` separator keeps the name from reading as a reserved word, which the
 * browser would drop silently. DOM-free, so server and client agree.
 */
export function transitionName(prefix: string, key: string | number): string {
  return serializeIdentifier(`${prefix}_${String(key)}`);
}

/**
 * CSSOM "serialize an identifier"
 * (https://drafts.csswg.org/cssom/#serialize-an-identifier), written out
 * because `CSS.escape` exists only in a browser.
 */
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
