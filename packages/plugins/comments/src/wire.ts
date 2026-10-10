import type { JsonObject } from "plumix";
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "plumix/blocks";
import { documentBasePath } from "plumix/blocks/renderer";
import { labelSourceText } from "plumix/i18n";
import * as v from "valibot";

import type { CommentRefusalCode } from "./refusals.js";
import type { ResolvedComment } from "./server/load-thread.js";
import type { CommentFormError, CommentStatus } from "./types.js";
import { LIST_PATH, SUBMIT_PATH } from "./contract.js";
import { UNREACHABLE } from "./messages.js";
import { isRefusalCode, REFUSALS } from "./refusals.js";
import { COMMENT_STATUSES } from "./types.js";

// Decoded, not asserted: a stale service worker, proxy or captive portal can
// answer 200 with something else.
const AnswerResponse = v.union([
  v.object({ status: v.picklist(COMMENT_STATUSES) }),
  v.object({ error: v.string() }),
]);

// Names no field, so the summary renders it as text and a theme reads it via
// `errorFor("")`.
const unreachable: readonly CommentFormError[] = [
  { field: "", message: labelSourceText(UNREACHABLE) },
];

// Wording comes from the server's table, so the browser shows exactly what the
// no-JavaScript page would.
function refusalErrors(code: string): readonly CommentFormError[] {
  if (!isRefusalCode(code)) return unreachable;
  const refusal = REFUSALS[code];
  return [{ field: refusal.field, message: labelSourceText(refusal.message) }];
}

/** How the last submission was answered. */
export type CommentAnswer =
  | { readonly ok: true; readonly status: CommentStatus }
  | { readonly ok: false; readonly errors: readonly CommentFormError[] };

/**
 * Sends JSON with the CSRF header, so the submission keeps the session a
 * `formPost` request would lose.
 */
export async function postComment(
  action: string,
  fields: JsonObject,
): Promise<CommentAnswer> {
  try {
    const response = await fetch(action, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        // Sent so a scripted post goes through the ordinary CSRF gate rather
        // than the `formPost` exemption, which would take the session away.
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      },
      body: JSON.stringify(fields),
    });
    const payload = v.safeParse(AnswerResponse, await response.json());
    if (!payload.success) return { ok: false, errors: unreachable };
    const answer = payload.output;
    return "error" in answer
      ? { ok: false, errors: refusalErrors(answer.error) }
      : { ok: true, status: answer.status };
  } catch {
    return { ok: false, errors: unreachable };
  }
}

/** Where a browser posts a comment when nothing handed it an action. */
export function submitAction(basePath?: string): string {
  return `${basePath ?? documentBasePath()}${SUBMIT_PATH}`;
}

// Plain JSON turns `createdAt` into a string; revive it so `ResolvedComment`
// doesn't lie.
const PagedComment: v.GenericSchema<unknown, ResolvedComment> = v.object({
  id: v.number(),
  authorName: v.string(),
  isRegistered: v.boolean(),
  avatarUrl: v.string(),
  bodyHtml: v.string(),
  createdAt: v.pipe(
    v.string(),
    v.isoTimestamp(),
    v.transform((stamp) => new Date(stamp)),
  ),
  replies: v.array(v.lazy(() => PagedComment)),
});

const PageResponse = v.union([
  v.object({
    comments: v.array(PagedComment),
    hasMore: v.boolean(),
    nextCursor: v.nullable(v.string()),
  }),
  v.object({ error: v.string() }),
]);

/** How a request for older comments was answered. */
export type CommentPageAnswer =
  | {
      readonly ok: true;
      readonly comments: readonly ResolvedComment[];
      readonly hasMore: boolean;
      readonly nextCursor: string | null;
    }
  | {
      readonly ok: false;
      readonly reason: CommentRefusalCode | "unreachable";
    };

/**
 * Never throws: a missing or malformed page is `unreachable`; a named refusal
 * comes back by its code.
 */
export async function fetchCommentPage(
  entryId: number,
  cursor: string | null,
  basePath?: string,
): Promise<CommentPageAnswer> {
  const query = new URLSearchParams({ entryId: String(entryId) });
  if (cursor !== null) query.set("cursor", cursor);
  try {
    const response = await fetch(
      `${basePath ?? documentBasePath()}${LIST_PATH}?${query.toString()}`,
      { headers: { accept: "application/json" } },
    );
    const payload = v.safeParse(PageResponse, await response.json());
    if (!payload.success) return { ok: false, reason: "unreachable" };
    const answer = payload.output;
    if ("error" in answer) {
      return {
        ok: false,
        reason: isRefusalCode(answer.error) ? answer.error : "unreachable",
      };
    }
    return { ok: true, ...answer };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
