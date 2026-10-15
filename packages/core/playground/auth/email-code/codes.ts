import type { AppContext } from "plumix/plugin";
import { and, count, desc, eq, gte } from "plumix/db";

import { emailCodeMisses, emailCodes } from "./schema.js";

/** How long a code stays good, and the window the per-email cap counts. */
const CODE_TTL_MS = 10 * 60 * 1000;

/** Codes one address may be sent per window. */
const MAX_CODES_PER_EMAIL = 3;

/** Wrong guesses one code survives. */
const MAX_MISSES_PER_CODE = 5;

export type CodeCheck =
  "ok" | "code_expired" | "wrong_code" | "too_many_attempts";

const ENCODER = new TextEncoder();

async function hash(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ENCODER.encode(code));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const windowStart = (): Date => new Date(Date.now() - CODE_TTL_MS);

/**
 * A fresh six-digit code, or `null` once `email` has its cap this window.
 * The kernel has no rate limiter, so the method counts its own rows.
 */
export async function issueCode(
  ctx: AppContext,
  email: string,
): Promise<string | null> {
  const [sent] = await ctx.db
    .select({ value: count() })
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, email),
        gte(emailCodes.createdAt, windowStart()),
      ),
    );
  if ((sent?.value ?? 0) >= MAX_CODES_PER_EMAIL) return null;
  const [random = 0] = crypto.getRandomValues(new Uint32Array(1));
  const code = String(random % 1_000_000).padStart(6, "0");
  await ctx.db.insert(emailCodes).values({ email, codeHash: await hash(code) });
  return code;
}

/**
 * Checks `code` against the newest code sent to `email`. A match deletes
 * every code the address holds, so it can't be used twice.
 */
export async function checkCode(
  ctx: AppContext,
  email: string,
  code: string,
): Promise<CodeCheck> {
  const [latest] = await ctx.db
    .select()
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, email),
        gte(emailCodes.createdAt, windowStart()),
      ),
    )
    .orderBy(desc(emailCodes.id))
    .limit(1);
  if (latest === undefined) return "code_expired";
  const [misses] = await ctx.db
    .select({ value: count() })
    .from(emailCodeMisses)
    .where(eq(emailCodeMisses.codeId, latest.id));
  if ((misses?.value ?? 0) >= MAX_MISSES_PER_CODE) return "too_many_attempts";
  if ((await hash(code)) !== latest.codeHash) {
    await ctx.db.insert(emailCodeMisses).values({ codeId: latest.id });
    return "wrong_code";
  }
  await ctx.db.delete(emailCodes).where(eq(emailCodes.email, email));
  return "ok";
}
