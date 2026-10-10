import { eq, like, or } from "drizzle-orm";

import type { Db } from "../context/app-context.js";
import { users } from "../db/schema/users.js";
import { slugify } from "../slugify.js";

// Concurrent creates can pick the same derived slug and lose the unique race;
// each retry sees the winner's row and advances the suffix.
export const MAX_SLUG_ATTEMPTS = 5;

/**
 * Slugifies the name, never the email, which would leak into public author
 * URLs. Collisions take the smallest free numeric suffix.
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
