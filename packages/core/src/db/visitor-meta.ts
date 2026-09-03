import { encodeHexLowerCase } from "@oslojs/encoding";

import type { AppContext } from "../context/app.js";
import { DbError } from "./errors.js";
import { and, eq } from "./index.js";
import { settings } from "./schema/settings.js";
import { privateSettingsGroup } from "./settings-groups.js";

const SALT_KEY = "ip_salt";
const SALT_BYTES = 16;
// Real-world user-agent strings run 100-400 characters; 1024 leaves headroom
// while bounding row width on hostile input.
const MAX_UA_LENGTH = 1024;
const ENCODER = new TextEncoder();
/** The bucket every visitor whose address the runtime could not resolve shares. */
const UNKNOWN_ADDRESS = "unknown";

export interface VisitorMeta {
  /** Lowercase-hex SHA-256 of the salted address. */
  readonly ipHash: string;
  /** The `user-agent` header, truncated; null when the request carries none. */
  readonly userAgent: string | null;
}

export interface VisitorMetaOptions {
  /**
   * The caller's own namespace, usually its plugin id. The salt lands in
   * that namespace's private settings group, so no two callers share one:
   * either's hashes would otherwise be matchable against the other's.
   */
  readonly namespace: string;
}

async function readSalt(
  ctx: AppContext,
  group: string,
): Promise<string | null> {
  const [row] = await ctx.db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.group, group), eq(settings.key, SALT_KEY)));
  return typeof row?.value === "string" ? row.value : null;
}

/**
 * The per-install salt, minted on first use and persisted in the settings
 * table, so an install needs no env var or KV binding to store hashed
 * addresses. `onConflictDoNothing` plus a re-read makes concurrent
 * first-writes converge on one salt. Memoized so repeated hashing within one
 * request — a hook chain, a scheduled task walking rows — costs one read.
 */
function getOrCreateIpSalt(ctx: AppContext, group: string): Promise<string> {
  return ctx.memo(`core:ip-salt:${group}`, async () => {
    const existing = await readSalt(ctx, group);
    if (existing !== null) return existing;

    const bytes = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(bytes);
    const salt = encodeHexLowerCase(bytes);
    await ctx.db
      .insert(settings)
      .values({ group, key: SALT_KEY, value: salt })
      .onConflictDoNothing();
    return (await readSalt(ctx, group)) ?? salt;
  });
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    ENCODER.encode(`${salt}:${ip}`),
  );
  return encodeHexLowerCase(new Uint8Array(digest));
}

/**
 * What a public submission handler may keep about the visitor behind a
 * request: a salted hash of their address, and their user-agent. Cleartext
 * addresses are never stored, so a hash is all a rate limiter or an inbox has
 * to compare.
 *
 * Both halves come off the context, so they describe one visitor: the address
 * on `ctx.clientAddress` and the user-agent on `ctx.request`. A runtime that
 * resolved no address puts every such visitor in one shared bucket rather than
 * failing the submission.
 *
 * The salt defeats a precomputed table of the IPv4 space and nothing more: it
 * lives in the same database as the hashes, so it is no defence against
 * someone who has already read that database.
 */
export async function readVisitorMeta(
  ctx: AppContext,
  options: VisitorMetaOptions,
): Promise<VisitorMeta> {
  if (typeof options.namespace !== "string") {
    throw DbError.visitorNamespaceMissing();
  }
  const userAgent = ctx.request.headers.get("user-agent");
  return {
    ipHash: await hashIp(
      ctx.clientAddress ?? UNKNOWN_ADDRESS,
      await getOrCreateIpSalt(ctx, privateSettingsGroup(options.namespace)),
    ),
    userAgent: userAgent ? userAgent.slice(0, MAX_UA_LENGTH) : null,
  };
}
