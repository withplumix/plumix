import { sha256Hex } from "./hash.js";

interface GravatarOptions {
  /** Pixel size of the requested avatar. Defaults to 80. */
  readonly size?: number;
  /**
   * Fallback when the email has no Gravatar. Defaults to `"mp"`
   * (mystery-person), matching WordPress's default.
   */
  readonly default?: string;
}

/**
 * Gravatar avatar URL for an email. Hashes the normalized (trimmed,
 * lowercased) address with SHA-256 — Gravatar's recommended algorithm,
 * and the one `crypto.subtle` supports on both Workers and Node (no md5
 * dependency). The raw email never leaves the server; only its hash
 * rides in the URL.
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
