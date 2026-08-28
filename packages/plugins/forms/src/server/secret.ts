import type { AppContext } from "plumix/plugin";
import { and, eq } from "drizzle-orm";
import { settings } from "plumix/schema";

// Core's private-settings convention: a group whose name ends `_internal`
// holds server-only rows, and `settings.get` / `settings.upsert` refuse
// it — so a `settings:manage` holder cannot read this out of the admin.
// The same group core's `readVisitorMeta` puts this plugin's IP salt in.
const GROUP = "forms_internal";

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function read(ctx: AppContext, key: string): Promise<string | null> {
  const [row] = await ctx.db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.group, GROUP), eq(settings.key, key)));
  return typeof row?.value === "string" ? row.value : null;
}

/**
 * A per-install secret, lazily generated on first use and persisted in
 * the settings table — so the plugin needs no environment variable and no
 * KV binding to hold one. `onConflictDoNothing` plus a re-read makes
 * concurrent first-writes converge on one value.
 */
export function getOrCreateSecret(
  ctx: AppContext,
  key: string,
): Promise<string> {
  return ctx.memo(`${GROUP}:${key}`, async () => {
    const existing = await read(ctx, key);
    if (existing !== null) return existing;

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const secret = toHex(bytes);
    await ctx.db
      .insert(settings)
      .values({ group: GROUP, key, value: secret })
      .onConflictDoNothing();
    return (await read(ctx, key)) ?? secret;
  });
}
