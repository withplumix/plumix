import slugifyLib from "@sindresorhus/slugify";

/**
 * ASCII output, the WordPress/Ghost default, so URLs round-trip without
 * percent-encoding. CJK and some other scripts yield an empty string.
 */
export function slugify(input: string): string {
  return slugifyLib(input);
}
