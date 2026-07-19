// No-op tagged-template marker: returns the interpolated string verbatim. Its
// only job is to let vscode-styled-components + stylelint syntax-highlight and
// lint the inline CSS the tsc-only bars (admin bar, debug bar) emit — those
// surfaces have no bundler CSS pipeline, so their styles live as template
// strings rather than a separate stylesheet request.
export function css(
  strings: TemplateStringsArray,
  ...values: readonly string[]
): string {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    out += values[i] + (strings[i + 1] ?? "");
  }
  return out;
}
