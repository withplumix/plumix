import type { AppContext } from "plumix/plugin";
import { and, eq } from "drizzle-orm";
import { settings } from "plumix/schema";

/**
 * An `_internal` group is refused by `settings.get`/`settings.upsert`, so
 * admins can't read it.
 */
const GROUP = "forms_internal";

/**
 * Closed, so a typo can't mint a third key. Separate secrets, so one
 * token can't pass as the other.
 */
export type SecretName = "timing_secret" | "bind_secret";

/** Also how `signing.ts` renders a signature — one spelling, one place. */
export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Never mints, so an unauthenticated caller can't make a public route
 * write a row.
 */
export async function getSecret(
  ctx: AppContext,
  key: SecretName,
): Promise<string | null> {
  const [row] = await ctx.db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.group, GROUP), eq(settings.key, key)));
  return typeof row?.value === "string" ? row.value : null;
}

/** Concurrent first writes converge on one value. */
export function getOrCreateSecret(
  ctx: AppContext,
  key: SecretName,
): Promise<string> {
  return ctx.memo(`${GROUP}:${key}`, async () => {
    const existing = await getSecret(ctx, key);
    if (existing !== null) return existing;

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const secret = toHex(bytes);
    await ctx.db
      .insert(settings)
      .values({ group: GROUP, key, value: secret })
      .onConflictDoNothing();
    return (await getSecret(ctx, key)) ?? secret;
  });
}
