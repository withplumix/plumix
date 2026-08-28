import type { AppContext } from "plumix/plugin";
import { withBasePath } from "plumix";
import { readVisitorMeta } from "plumix/db";

import type { FormRegistry } from "../registry.js";
import type { SubmissionStatus } from "../types.js";
import {
  pickStoredAnswers,
  readSubmittedValues,
  visibleFields,
} from "../answers.js";
import { FORM_SLUG_FIELD, HONEYPOT_FIELD } from "../contract.js";
import { buildLabelSnapshot } from "./labels.js";
import { insertSubmission } from "./repository.js";

// The route is public and unauthenticated, so a body arrives before
// anything has decided whether it is welcome. Text and email answers do
// not approach this. Counted as it streams rather than read and measured:
// `content-length` is absent on a chunked body, so trusting it would cap
// nothing. Per-field limits belong with the validation slice.
const MAX_BODY_BYTES = 64 * 1024;

/**
 * The submission body, or `null` once it passes the cap. Read as
 * urlencoded because that is what a `<form>` with no `enctype` sends and
 * the block never sets one — multipart would mean file uploads, which
 * this plugin deliberately does not accept.
 */
async function readBoundedBody(
  request: Request,
): Promise<URLSearchParams | null> {
  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();

  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return new URLSearchParams(text + decoder.decode());
}

// Back to the page the form was on. The visitor's own browser tells us
// which one; anything not on this site is ignored rather than followed,
// so the response can never be turned into an open redirect.
function backToForm(request: Request, ctx: AppContext): Response {
  const referer = URL.parse(request.headers.get("referer") ?? "");
  const location =
    referer !== null && referer.origin === URL.parse(ctx.origin)?.origin
      ? referer.href
      : withBasePath("/", ctx.basePath);
  return new Response(null, {
    status: 303,
    headers: { location, "cache-control": "no-store" },
  });
}

/**
 * The public submit handler, mounted at `POST /_plumix/forms/submit` as a
 * `formPost` route so a plain `<form method="post">` reaches it without
 * the `X-Plumix-Request` header a browser cannot set. The dispatcher's
 * Origin check stands in for that header; this handler reads no session
 * and grants nothing on the strength of one.
 *
 * A filled honeypot is stored as spam and answered exactly like a real
 * submission — telling a bot it was caught only teaches it to stop
 * filling the trap.
 *
 * Visibility is judged from the answers themselves, by the same call the
 * renderer makes: a field the submitted answers hide is dropped before
 * anything reads it, so it never reaches the row and no constraint of
 * its own is ever asked about. What the answers reveal is kept, which is
 * what lets a visitor whose script showed them a further question have
 * it stored.
 */
export function createSubmitHandler(registry: FormRegistry) {
  return async (request: Request, ctx: AppContext): Promise<Response> => {
    const body = await readBoundedBody(request);
    if (body === null) {
      return new Response("Payload Too Large", { status: 413 });
    }

    const slug = body.get(FORM_SLUG_FIELD);
    const form = slug === null ? undefined : registry.get(slug);
    if (!form) return new Response("Not Found", { status: 404 });

    const status: SubmissionStatus =
      (body.get(HONEYPOT_FIELD)?.trim().length ?? 0) > 0 ? "spam" : "new";

    const values = readSubmittedValues(form.fields, body);
    const visible = visibleFields(form.fields, values);

    // Nothing here grants or refuses anything on the strength of the
    // visitor's address; it is stored, hashed, for whoever reads the inbox.
    const { ipHash, userAgent } = await readVisitorMeta(ctx, request, {
      namespace: "forms",
    });
    await insertSubmission(ctx, {
      formSlug: form.slug,
      status,
      answers: pickStoredAnswers(visible, values),
      labels: buildLabelSnapshot(visible),
      ipHash,
      userAgent,
    });

    return backToForm(request, ctx);
  };
}
