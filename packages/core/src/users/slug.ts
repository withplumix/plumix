import { eq, like, or } from "drizzle-orm";

import type { Db } from "../context/app.js";
import { users } from "../db/schema/users.js";
import { slugify } from "../slugify.js";

// `deriveUserSlug` reads then the INSERT writes, so concurrent creates with the
// same derived base can both pick it and one loses the unique race. Callers
// re-derive and retry up to this many times; each retry sees the winner's row,
// so the loser advances to the next suffix.
export const MAX_SLUG_ATTEMPTS = 5;

/**
 * Derive a unique, URL-safe author slug from a user's name. Slugifies the name
 * (never the email — that would leak it into public `/authors/{slug}` URLs),
 * falling back to `user` when the name transliterates to nothing. On collision
 * the bare base is kept if free, otherwise the smallest free numeric suffix is
 * appended (`john`, `john-1`, `john-2`), mirroring how a single term/entry keeps
 * its bare slug. Called once at user creation; the result is stable thereafter.
 */
export async function deriveUserSlug(
  db: Db,
  name: string | null | undefined,
): Promise<string> {
  const base = slugify(name ?? "") || "user";
  const rows = await db
    .select({ slug: users.slug })
    .from(users)
    .where(or(eq(users.slug, base), like(users.slug, `${base}-%`)));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 1; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
