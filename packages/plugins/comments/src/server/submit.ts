import type { AppContext } from "plumix/plugin";
import { eq } from "drizzle-orm";
import { readVisitorMeta } from "plumix/db";
import { jsonResponse } from "plumix/plugin";
import { entries } from "plumix/schema";
import * as v from "valibot";

import type { ResolvedCommentsConfig } from "../config.js";
import type { CommentModerationCandidate } from "./hooks.js";
import { isCommentingEnabled } from "./enablement.js";
import { applyModerationVerdict, decideBaselineStatus } from "./moderation.js";
import {
  clampParent,
  countPriorApproved,
  insertComment,
} from "./repository.js";
import { checkRateLimit, isHoneypotTripped } from "./spam.js";

const submitInputSchema = v.object({
  entryId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  parentId: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
    null,
  ),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  email: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(254)), ""),
  body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(10_000)),
  // Honeypot — real users never fill it.
  website: v.optional(v.string(), ""),
});

function isClosed(
  publishedAt: Date | null,
  closeAfterDays: number | null,
): boolean {
  if (closeAfterDays === null || publishedAt === null) return false;
  return Date.now() > publishedAt.getTime() + closeAfterDays * 86_400_000;
}

/**
 * The public comment-submission handler. Mounted at
 * `POST /_plumix/comments/submit` (`auth: "public"`); the dispatcher's
 * CSRF header + same-origin guard runs upstream. Pipeline: validate →
 * honeypot → resolve+gate the entry → identity (logged-in fast path) →
 * salted ip hash + rate limit → trust baseline + `comment:moderate`
 * chain → insert → fire `comment:created`.
 */
export function createSubmitHandler(config: ResolvedCommentsConfig) {
  return async (request: Request, ctx: AppContext): Promise<Response> => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = v.safeParse(submitInputSchema, raw);
    if (!parsed.success) {
      return jsonResponse({ error: "invalid_input" }, { status: 400 });
    }
    const input = parsed.output;

    // Filled honeypot → fake success, never store, never reveal the trap.
    if (isHoneypotTripped(input.website))
      return jsonResponse({ status: "pending" });

    const [entry] = await ctx.db
      .select({
        id: entries.id,
        type: entries.type,
        status: entries.status,
        publishedAt: entries.publishedAt,
      })
      .from(entries)
      .where(eq(entries.id, input.entryId));
    if (entry?.status !== "published") {
      return jsonResponse({ error: "entry_not_found" }, { status: 404 });
    }

    const supports = ctx.plugins.entryTypes.get(entry.type)?.supports;
    if (!isCommentingEnabled(entry.type, supports, config)) {
      return jsonResponse({ error: "comments_disabled" }, { status: 403 });
    }
    if (isClosed(entry.publishedAt, config.closeAfterDays)) {
      return jsonResponse({ error: "comments_closed" }, { status: 403 });
    }

    // Public route — the dispatcher doesn't authenticate it, so check for a
    // session here to give logged-in commenters the trust fast path.
    const auth = await ctx.authenticator.authenticate(request, ctx.db);
    const authUser = auth?.user ?? null;
    const isAuthenticated = authUser !== null;
    // Lowercase so the trust lookup and Gravatar agree on one identity.
    const email = (authUser?.email ?? input.email).trim().toLowerCase();
    if (config.requireEmail && email.length === 0) {
      return jsonResponse({ error: "email_required" }, { status: 400 });
    }

    // Off Cloudflare the address behind the hash is client-spoofable, so
    // the rate limiter is best-effort there and edge/WAF rules are the
    // real flood defence.
    const { ipHash, userAgent } = await readVisitorMeta(ctx, request, {
      namespace: "comments",
    });
    if (await checkRateLimit(ctx, ipHash, config.rateLimit)) {
      return jsonResponse({ error: "rate_limited" }, { status: 429 });
    }

    const priorApprovedCount =
      email.length > 0 ? await countPriorApproved(ctx, email) : 0;
    const baseline = decideBaselineStatus({
      mode: config.mode,
      priorApprovedCount,
      isAuthenticated,
    });
    const candidate: CommentModerationCandidate = {
      entryId: entry.id,
      authorName: input.name,
      authorEmail: email,
      bodyMd: input.body,
      ipHash,
      isAuthenticated,
    };
    const verdict = await ctx.hooks.applyFilter(
      "comment:moderate",
      baseline,
      candidate,
    );
    const status = applyModerationVerdict(baseline, verdict);

    const parentId = await clampParent(
      ctx,
      input.parentId,
      entry.id,
      config.maxDepth,
    );

    const row = await insertComment(ctx, {
      entryId: entry.id,
      parentId,
      status,
      authorUserId: authUser?.id ?? null,
      // Display name is commenter-supplied even when logged in; the real
      // account link lives in authorUserId. Sourcing it from the user
      // record (WP-style snapshot) is a later refinement.
      authorName: input.name,
      authorEmail: email,
      bodyMd: input.body,
      ipHash,
      userAgent,
    });

    await ctx.hooks.doAction("comment:created", row);

    return jsonResponse({ status });
  };
}
