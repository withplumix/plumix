/** The locales of the compiled catalogs a bundle holds under `prefix`. */
export function shippedLocales(
  moduleIds: readonly string[],
  prefix: string,
): string[] {
  return moduleIds
    .filter((id) => id.startsWith(prefix) && id.endsWith(".mjs"))
    .map((id) => id.slice(prefix.length, -".mjs".length))
    .filter((locale) => !locale.includes("/"))
    .sort();
}
