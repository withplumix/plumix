import { sha256Hex } from "./hash.js";

interface GravatarOptions {
  // Defaults to 80.
  readonly size?: number;
  // Defaults to `"mp"`, matching WordPress.
  readonly default?: string;
}

/**
 * SHA-256, not md5: Gravatar recommends it and `crypto.subtle` supports it on
 * every runtime.
 */
export async function gravatarUrl(
  email: string,
  options: GravatarOptions = {},
): Promise<string> {
  const hash = await sha256Hex(email.trim().toLowerCase());
  const size = options.size ?? 80;
  const fallback = options.default ?? "mp";
  return `https://www.gravatar.com/avatar/${hash}?s=${String(size)}&d=${fallback}`;
}
