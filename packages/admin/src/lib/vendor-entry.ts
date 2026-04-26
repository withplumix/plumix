const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

export function isValidIdentifier(name: string): boolean {
  return IDENTIFIER_RE.test(name) && name !== "__esModule";
}

// `import * as _ns` works for both CJS and native ESM specifiers:
// esbuild puts CJS `module.exports` on `_ns.default` and copies its
// enumerable keys onto `_ns`. The build script verifies the keys
// exist via dynamic introspection before calling this.
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
