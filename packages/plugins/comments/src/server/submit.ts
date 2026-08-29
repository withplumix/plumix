import type { AppContext } from "plumix/plugin";
import { eq } from "drizzle-orm";
import { resolveReturnUrl } from "plumix";
import { readVisitorMeta } from "plumix/db";
import { labelSourceText } from "plumix/i18n";
import { jsonResponse } from "plumix/plugin";
import { entries } from "plumix/schema";
import * as v from "valibot";

import type { ResolvedCommentsConfig } from "../config.js";
import type { CommentRefusalCode } from "../refusals.js";
import type { CommentStatus } from "../types.js";
import type { CommentModerationCandidate } from "./hooks.js";
import { RETURN_FIELD, SUBMIT_PATH } from "../contract.js";
import { REFUSALS } from "../refusals.js";
import { isCommentingEnabled } from "./enablement.js";
import { applyModerationVerdict, decideBaselineStatus } from "./moderation.js";
import { readSubmission } from "./read-submission.js";
import { rejectPage } from "./reject-page.js";
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

/** The controls a schema refusal can be shown against. */
const NAMEABLE = ["name", "email", "body"] as const;

/**
 * The control a schema refusal belongs to, where it belongs to one. A
 * refusal about `entryId` or `parentId` has no control a visitor can
 * correct, so it stays a refusal about the submission.
 */
function refusedField(issues: readonly v.BaseIssue<unknown>[]): string {
  const key = issues[0]?.path?.[0]?.key;
  return NAMEABLE.some((name) => name === key) ? String(key) : "";
}

// `no-store` on every answer: the page carrying the form is edge-cached,
// and each of these is about one visitor's comment.
function noStore(body: unknown, status: number): Response {
  return jsonResponse(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function isClosed(
  publishedAt: Date | null,
  closeAfterDays: number | null,
): boolean {
  if (closeAfterDays === null || publishedAt === null) return false;
  return Date.now() > publishedAt.getTime() + closeAfterDays * 86_400_000;
}

/**
 * The public comment-submission handler. Mounted at
 * `POST /_plumix/comments/submit` as a `formPost` route, so a plain
 * `<form method="post">` reaches it without the `X-Plumix-Request` header
 * a browser cannot set on an ordinary submit; the dispatcher's Origin
 * check is then the whole gate. Pipeline: validate → honeypot → resolve +
 * gate the entry → identity (logged-in fast path) → salted ip hash + rate
 * limit → trust baseline + `comment:moderate` chain → insert → fire
 * `comment:created`.
 *
 * One endpoint, two answer shapes, negotiated on what was *sent* rather
 * than on `Accept`: a JSON body is a scripted caller by construction, and
 * `fetch` with no `Accept` header of its own is the ordinary way to make
 * one — negotiating on `Accept` would have flipped every existing caller
 * to the redirect. Every exit goes through `accepted` or `fail`, including
 * the honeypot's fake success: answering a trapped submission differently
 * from a real one is how a bot learns it was caught.
 *
 * The request that took the `formPost` exemption arrives with no session
 * to read — core hands it an authenticator that resolves nobody — so a
 * signed-in author posting without JavaScript is treated as the anonymous
 * commenter they are indistinguishable from. Under the default
 * `first_time` mode that costs them their first comment's fast path and
 * its `authorUserId` link, and only their first: the prior-approved count
 * carries them from the second on.
 */
export function createSubmitHandler(config: ResolvedCommentsConfig) {
  return async (request: Request, ctx: AppContext): Promise<Response> => {
    const { form, body, echoed } = await readSubmission(request);
    const returnTo = resolveReturnUrl(request, ctx, {
      returnTo: echoed[RETURN_FIELD],
      endpoint: SUBMIT_PATH,
    });

    const fail = (
      code: CommentRefusalCode,
      // The table's own control by default; a schema refusal overrides it
      // with whichever control the offending answer came from.
      field: string = REFUSALS[code].field,
    ): Response => {
      const refusal = REFUSALS[code];
      if (!form) return noStore({ error: code }, refusal.status);
      return rejectPage(ctx, {
        // A body carrying no readable entry comes back as a form pointing
        // at no entry, which the retry is refused for. There is nothing
        // better to put here: the alternative is a bare page, and that
        // loses the visitor's words as well as the entry.
        entryId: echoed.entryId ?? 0,
        parentId: echoed.parentId ?? null,
        returnTo,
        values: echoed,
        errors: [{ field, message: labelSourceText(refusal.message) }],
        requireEmail: config.requireEmail,
        status: refusal.status,
      });
    };
    const accepted = (status: CommentStatus): Response =>
      form
        ? new Response(null, {
            status: 303,
            headers: { location: returnTo, "cache-control": "no-store" },
          })
        : noStore({ status }, 200);

    if (body === null) return fail("invalid_json");
    const parsed = v.safeParse(submitInputSchema, body.raw);
    if (!parsed.success) {
      return fail("invalid_input", refusedField(parsed.issues));
    }
    const input = parsed.output;

    // Filled honeypot → fake success, never store, never reveal the trap.
    if (isHoneypotTripped(input.website)) return accepted("pending");

    const [entry] = await ctx.db
      .select({
        id: entries.id,
        type: entries.type,
        status: entries.status,
        publishedAt: entries.publishedAt,
      })
      .from(entries)
      .where(eq(entries.id, input.entryId));
    if (entry?.status !== "published") return fail("entry_not_found");

    const supports = ctx.plugins.entryTypes.get(entry.type)?.supports;
    if (!isCommentingEnabled(entry.type, supports, config)) {
      return fail("comments_disabled");
    }
    if (isClosed(entry.publishedAt, config.closeAfterDays)) {
      return fail("comments_closed");
    }

    // Public route — the dispatcher doesn't authenticate it, so check for a
    // session here to give logged-in commenters the trust fast path. On a
    // request that took the `formPost` exemption this resolves nobody, by
    // design; reading the session back another way would defeat the guard.
    const auth = await ctx.authenticator.authenticate(request, ctx.db);
    const authUser = auth?.user ?? null;
    const isAuthenticated = authUser !== null;
    // Lowercase so the trust lookup and Gravatar agree on one identity.
    const email = (authUser?.email ?? input.email).trim().toLowerCase();
    if (config.requireEmail && email.length === 0)
      return fail("email_required");

    // Off Cloudflare the address behind the hash is client-spoofable, so
    // the rate limiter is best-effort there and edge/WAF rules are the
    // real flood defence.
    const { ipHash, userAgent } = await readVisitorMeta(ctx, request, {
      namespace: "comments",
    });
    if (await checkRateLimit(ctx, ipHash, config.rateLimit)) {
      return fail("rate_limited");
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

    return accepted(status);
  };
}
