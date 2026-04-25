/**
 * Pure helpers for the vendor-chunk build script. Lives in `src/lib`
 * so vitest picks up the colocated test — the script itself runs in
 * Node and isn't suitable for the jsdom test runner.
 */

const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

export function isValidIdentifier(name: string): boolean {
  return IDENTIFIER_RE.test(name) && name !== "__esModule";
}

/**
 * Build the synthesised entry source the vendor-chunk script feeds
 * into esbuild. `import * as _ns` works whether the source is CJS or
 * native ESM: CJS puts `module.exports` on `_ns.default` and copies
 * its enumerable keys onto `_ns`; native ESM passes both through
 * unchanged. The keys we re-export must already be present in the
 * specifier's namespace (the script verifies this via dynamic import
 * before calling this function).
 */
export function renderVendorEntrySource(
  specifier: string,
  namedKeys: readonly string[],
  hasDefault: boolean,
): string {
  const lines = [`import * as _ns from ${JSON.stringify(specifier)};`];
  if (hasDefault) lines.push("export default _ns.default;");
  for (const key of namedKeys) {
    lines.push(`export const ${key} = _ns[${JSON.stringify(key)}];`);
  }
  return `${lines.join("\n")}\n`;
}
