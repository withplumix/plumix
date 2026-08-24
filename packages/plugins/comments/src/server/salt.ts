import type { AppContext } from "plumix/plugin";
import { and, eq } from "drizzle-orm";
import { settings } from "plumix/schema";

import { toHex } from "./hash.js";

// Its own settings group, not "comments": a future user-facing `comments`
// settings group read via `settings.get` would otherwise surface this
// secret in the admin UI.
const GROUP = "comments_internal";
const KEY = "ip_salt";

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function readSalt(ctx: AppContext): Promise<string | null> {
  const [row] = await ctx.db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.group, GROUP), eq(settings.key, KEY)));
  return typeof row?.value === "string" ? row.value : null;
}

/**
 * The per-install salt for {@link import("./ip-hash.js").hashIp}. Lazily
 * generated on first comment and persisted in the settings table, so no
 * env var or KV binding is required. `onConflictDoNothing` + a re-read
 * makes concurrent first-writes converge on one salt.
 */
export async function getOrCreateIpSalt(ctx: AppContext): Promise<string> {
  const existing = await readSalt(ctx);
  if (existing !== null) return existing;

  const salt = generateSalt();
  await ctx.db
    .insert(settings)
    .values({ group: GROUP, key: KEY, value: salt })
    .onConflictDoNothing();
  return (await readSalt(ctx)) ?? salt;
}
