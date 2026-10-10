/**
 * Lets editors and stylelint highlight and lint the inline CSS of the tsc-only
 * bars, which have no bundler CSS pipeline.
 */
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
