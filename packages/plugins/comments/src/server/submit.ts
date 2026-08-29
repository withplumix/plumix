import type { AppContext } from "plumix/plugin";
import { eq } from "drizzle-orm";
import { readVisitorMeta } from "plumix/db";
import { jsonResponse } from "plumix/plugin";
import { entries } from "plumix/schema";
import * as v from "valibot";

import type { ResolvedCommentsConfig } from "../config.js";
import type { CommentModerationCandidate } from "./hooks.js";
import { commentRejectPage } from "./comment-reject-page.js";
import { isCommentingEnabled } from "./enablement.js";
import { applyModerationVerdict, decideBaselineStatus } from "./moderation.js";
import {
  clampParent,
  countPriorApproved,
  insertComment,
} from "./repository.js";
import { checkRateLimit, isHoneypotTripped } from "./spam.js";

// SPIKE P2 — the no-JS half of the endpoint. The island keeps asking for
// JSON and keeps getting it; a browser posting a plain form asks for HTML
// and is sent back where it came from.
const RETURN_FIELD = "returnTo";

// SPIKE FINDING — negotiating on `Accept` broke every existing JS caller:
// `fetch(url, {method:"POST", body: JSON.stringify(...)})` sends no Accept
// header at all, so five of the eleven shipped tests flipped from 200 JSON
// to 303. Negotiating on what was *sent* instead is non-breaking: a JSON
// body is a scripted caller by construction, and urlencoded is the form.
function wantsJson(request: Request): boolean {
  return !isFormEncoded(request);
}

/**
 * Back to the page the form was on. The hidden field first, then the
 * `Referer`; both are the visitor's to set, so both are held to this
 * site's origin and refused the endpoint itself — the response can be
 * turned into neither an open redirect nor a loop.
 */
function returnUrl(raw: unknown, request: Request, ctx: AppContext): string {
  const origin = URL.parse(ctx.origin)?.origin;
  const submitPath = `${ctx.basePath}/_plumix/comments/submit`;
  const field =
    typeof raw === "object" && raw !== null && RETURN_FIELD in raw
      ? String((raw as Record<string, unknown>)[RETURN_FIELD])
      : null;
  for (const candidate of [field, request.headers.get("referer")]) {
    const url = URL.parse(candidate ?? "");
    if (url !== null && url.origin === origin && url.pathname !== submitPath) {
      return url.href;
    }
  }
  return ctx.basePath === "" ? "/" : ctx.basePath;
}

function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, "cache-control": "no-store" },
  });
}

// SPIKE P1 — a form sends every field as a string, so the numeric ones need
// coercing before the schema the JSON path uses can see them. Kept separate
// from that schema rather than loosening it: `entryId: "12abc"` must stay a
// 400 on both paths.
type FormBody = Readonly<Record<string, string | number>>;

function isFormEncoded(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").includes(
    "application/x-www-form-urlencoded",
  );
}

async function readFormBody(request: Request): Promise<FormBody> {
  const body = new URLSearchParams(await request.text());
  const out: Record<string, string | number> = {};
  for (const [key, value] of body) out[key] = value;
  for (const key of ["entryId", "parentId"]) {
    const value = body.get(key);
    if (value === null || value === "") continue;
    const n = Number(value);
    out[key] = Number.isFinite(n) ? n : value;
  }
  return out;
}

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
    if (isFormEncoded(request)) {
      raw = await readFormBody(request);
    } else {
      try {
        raw = await request.json();
      } catch {
        return jsonResponse({ error: "invalid_json" }, { status: 400 });
      }
    }
    // SPIKE P2 — one endpoint, two answer shapes. Chosen once, up here, so
    // every branch below negotiates the same way.
    const html = !wantsJson(request);
    const back = returnUrl(raw, request, ctx);
    const values: Record<string, string> =
      typeof raw === "object" && raw !== null
        ? Object.fromEntries(
            Object.entries(raw as Record<string, unknown>)
              .filter(([key]) => key !== "website")
              .map(([key, value]) => [key, String(value)]),
          )
        : {};
    // SPIKE P3 — the same refusal, answered with the form back instead of
    // a dead end, because the plugin now owns the markup.
    const fail = (
      error: string,
      status: number,
      message: string,
      field = "",
    ): Response =>
      html
        ? commentRejectPage(ctx, {
            action: `${ctx.basePath}/_plumix/comments/submit`,
            entryId: Number(values.entryId ?? 0),
            parentId:
              values.parentId === undefined ? null : Number(values.parentId),
            returnTo: back,
            values,
            errors: [{ field, message }],
            status,
          })
        : jsonResponse({ error }, { status });
    const accepted = (status: string): Response =>
      html ? seeOther(back) : jsonResponse({ status });

    const parsed = v.safeParse(submitInputSchema, raw);
    if (!parsed.success) {
      return fail("invalid_input", 400, "That comment could not be read.");
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
    if (entry?.status !== "published") {
      return fail("entry_not_found", 404, "That post could not be found.");
    }

    const supports = ctx.plugins.entryTypes.get(entry.type)?.supports;
    if (!isCommentingEnabled(entry.type, supports, config)) {
      return fail("comments_disabled", 403, "Comments are closed here.");
    }
    if (isClosed(entry.publishedAt, config.closeAfterDays)) {
      return fail("comments_closed", 403, "This discussion has closed.");
    }

    // Public route — the dispatcher doesn't authenticate it, so check for a
    // session here to give logged-in commenters the trust fast path.
    const auth = await ctx.authenticator.authenticate(request, ctx.db);
    const authUser = auth?.user ?? null;
    const isAuthenticated = authUser !== null;
    // Lowercase so the trust lookup and Gravatar agree on one identity.
    const email = (authUser?.email ?? input.email).trim().toLowerCase();
    if (config.requireEmail && email.length === 0) {
      return fail("email_required", 400, "An email address is required.");
    }

    // Off Cloudflare the address behind the hash is client-spoofable, so
    // the rate limiter is best-effort there and edge/WAF rules are the
    // real flood defence.
    const { ipHash, userAgent } = await readVisitorMeta(ctx, request, {
      namespace: "comments",
    });
    if (await checkRateLimit(ctx, ipHash, config.rateLimit)) {
      return fail("rate_limited", 429, "Too many comments — try again later.");
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
