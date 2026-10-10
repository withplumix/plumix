import type { AppContext } from "plumix/plugin";
import { resolveReturnUrl } from "plumix/auth";
import { readVisitorMeta } from "plumix/db";
import { labelSourceText } from "plumix/i18n";
import { jsonResponse, listUserMetaFields, startingMeta } from "plumix/plugin";
import * as v from "valibot";

import type { ResolvedCommentsConfig } from "../config.js";
import type { CommentRefusalCode } from "../refusals.js";
import type { CommentStatus } from "../types.js";
import type { CommentModerationCandidate } from "./hooks.js";
import { RETURN_FIELD, SUBMIT_PATH } from "../contract.js";
import { REFUSALS } from "../refusals.js";
import { resolveCommentableEntry } from "./commentable.js";
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

const NAMEABLE = ["name", "email", "body"] as const;

/** `entryId` and `parentId` have no control a visitor can correct. */
function refusedField(issues: readonly v.BaseIssue<unknown>[]): string {
  const key = issues[0]?.path?.[0]?.key;
  return NAMEABLE.some((name) => name === key) ? String(key) : "";
}

/**
 * `no-store` on every answer: the page carrying the form is edge-cached,
 * and each of these is about one visitor's comment.
 */
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
 * Answer shape is negotiated on what was sent, not `Accept`, which `fetch`
 * omits. A `formPost` request carries no session, so a signed-in author
 * without JavaScript is treated as anonymous.
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
        // No readable entry: the retry will be refused, but a bare page would
        // also lose the visitor's words.
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

    const resolved = await resolveCommentableEntry(ctx, input.entryId, config);
    if (!resolved.ok) return fail(resolved.reason);
    const { entry } = resolved;
    if (isClosed(entry.publishedAt, config.closeAfterDays)) {
      return fail("comments_closed");
    }

    // A `formPost` request resolves nobody here, by design; reading the session
    // another way would defeat the guard.
    const auth = await ctx.authenticator.authenticate(request, ctx.db, {
      startingUserMeta: startingMeta(listUserMetaFields(ctx.plugins)),
    });
    const authUser = auth?.user ?? null;
    const isAuthenticated = authUser !== null;
    // Lowercase so the trust lookup and Gravatar agree on one identity.
    const email = (authUser?.email ?? input.email).trim().toLowerCase();
    if (config.requireEmail && email.length === 0)
      return fail("email_required");

    // Without `ctx.clientAddress` every commenter shares one bucket and the
    // limiter closes comments for everyone; edge/WAF rules must defend floods
    // there.
    const { ipHash, userAgent } = await readVisitorMeta(ctx, {
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

    await ctx.hooks.doAction("comment:created", row, ctx);

    return accepted(status);
  };
}
