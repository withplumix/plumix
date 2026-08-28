import type { AppContext } from "plumix/plugin";
import { and, eq } from "drizzle-orm";
import { settings } from "plumix/schema";

// Its own settings group, not "forms": a user-facing `forms` group read
// through `settings.get` would otherwise surface this secret in the admin.
const GROUP = "forms_internal";
const KEY = "ip_salt";
const ENCODER = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readSalt(ctx: AppContext): Promise<string | null> {
  const [row] = await ctx.db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.group, GROUP), eq(settings.key, KEY)));
  return typeof row?.value === "string" ? row.value : null;
}

/**
 * The per-install salt. Lazily generated on first submission and
 * persisted in the settings table, so no env var or KV binding is
 * required. `onConflictDoNothing` plus a re-read makes concurrent
 * first-writes converge on one salt.
 */
export function getOrCreateIpSalt(ctx: AppContext): Promise<string> {
  return ctx.memo(`${GROUP}:${KEY}`, async () => {
    const existing = await readSalt(ctx);
    if (existing !== null) return existing;

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const salt = toHex(bytes);
    await ctx.db
      .insert(settings)
      .values({ group: GROUP, key: KEY, value: salt })
      .onConflictDoNothing();
    return (await readSalt(ctx)) ?? salt;
  });
}

/**
 * Salted SHA-256 of a visitor IP. Cleartext addresses are never stored.
 * The per-install salt defeats a precomputed table of the IPv4 space and
 * nothing more: it lives in the same database as the hashes, so it is no
 * defence against someone who has already read that database.
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    ENCODER.encode(`${salt}:${ip}`),
  );
  return toHex(new Uint8Array(digest));
}
