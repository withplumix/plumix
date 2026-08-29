import type { JsonObject } from "plumix";
import { labelSourceText } from "plumix/i18n";
import * as v from "valibot";

import type { CommentFormError, CommentStatus } from "./types.js";
import { CSRF_HEADER, CSRF_HEADER_VALUE, SUBMIT_PATH } from "./contract.js";
import { UNREACHABLE } from "./messages.js";
import { isRefusalCode, REFUSALS } from "./refusals.js";
import { COMMENT_STATUSES } from "./types.js";

/**
 * What the endpoint answers a scripted caller with — decoded rather than
 * asserted, because it arrives over `fetch` from a URL a page carries, and
 * a stale service worker, an intercepting proxy or a captive portal all
 * answer 200 with something else entirely.
 */
const AnswerResponse = v.union([
  v.object({ status: v.picklist(COMMENT_STATUSES) }),
  v.object({ error: v.string() }),
]);

/**
 * What a comment that never reached the endpoint comes back as. It names
 * no field: the summary reads such an error as text rather than as a link
 * to nowhere, and a theme reads it back through `errorFor("")`.
 */
const unreachable: readonly CommentFormError[] = [
  { field: "", message: labelSourceText(UNREACHABLE) },
];

/**
 * The refusal the endpoint named, as the message and the control it
 * belongs against. The wording lives on the server's own table, so a
 * browser reads back exactly what the no-JavaScript page would have shown
 * rather than carrying a second copy of it.
 */
function refusalErrors(code: string): readonly CommentFormError[] {
  if (!isRefusalCode(code)) return unreachable;
  const refusal = REFUSALS[code];
  return [{ field: refusal.field, message: labelSourceText(refusal.message) }];
}

/**
 * The subdirectory prefix this deployment is mounted under, empty at the
 * domain root. A hydrated island has no `PlumixProvider` context and a
 * public page carries no `<base href>`, so it is read from the marker the
 * islands bootstrap `<script>` injects — otherwise a subdirectory
 * deployment would post to the domain root and 404.
 */
function documentBasePath(): string {
  if (typeof document === "undefined") return "";
  return (
    document.querySelector<HTMLScriptElement>("script[data-plumix-base-path]")
      ?.dataset.plumixBasePath ?? ""
  );
}

/** How the last submission was answered. */
export type CommentAnswer =
  | { readonly ok: true; readonly status: CommentStatus }
  | { readonly ok: false; readonly errors: readonly CommentFormError[] };

/**
 * Post one comment as JSON, from either browser surface: the island over
 * the plugin's own markup, and `usePlumixCommentForm` over a theme's.
 *
 * JSON rather than the urlencoded body the plain form posts, because that
 * is what the endpoint negotiates on — and with the CSRF header, so a
 * scripted submission goes through the ordinary gate and keeps the session
 * the `formPost` exemption would have taken away.
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
        [CSRF_HEADER]: CSRF_HEADER_VALUE,
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
