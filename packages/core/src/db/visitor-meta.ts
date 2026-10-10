import { encodeHexLowerCase } from "@oslojs/encoding";

import type { AppContext } from "../context/app-context.js";
import { DbError } from "./errors.js";
import { and, eq } from "./index.js";
import { settings } from "./schema/settings.js";
import { privateSettingsGroup } from "./settings-groups.js";

const SALT_KEY = "ip_salt";
const SALT_BYTES = 16;
/**
 * Real-world user-agent strings run 100-400 characters; 1024 leaves headroom
 * while bounding row width on hostile input.
 */
const MAX_UA_LENGTH = 1024;
const ENCODER = new TextEncoder();
const UNKNOWN_ADDRESS = "unknown";

export interface VisitorMeta {
  /** Lowercase-hex SHA-256 of the salted address. */
  readonly ipHash: string;
  /** The `user-agent` header, truncated; null when the request carries none. */
  readonly userAgent: string | null;
}

export interface VisitorMetaOptions {
  /**
   * Usually the plugin id. Each namespace gets its own salt, so hashes can't be
   * matched across callers.
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
 * `onConflictDoNothing` plus a re-read makes concurrent first-writes converge
 * on one salt.
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
 * An unresolved address puts the visitor in one shared bucket. The salt lives
 * beside the hashes, so it defeats a precomputed IPv4 table and nothing more.
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
