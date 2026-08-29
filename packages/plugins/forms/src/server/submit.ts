import type { AppContext } from "plumix/plugin";
import { withBasePath } from "plumix";
import { readVisitorMeta } from "plumix/db";
import { labelSourceText } from "plumix/i18n";

import type { FormSubmission } from "../db/schema.js";
import type { FormDefinition } from "../define-form.js";
import type { FormRegistry } from "../registry.js";
import type {
  FormFieldError,
  FormSubmissionCandidate,
  FormSubmitResponse,
  SubmissionStatus,
} from "../types.js";
import {
  pickStoredAnswers,
  readSubmittedValues,
  visibleFields,
} from "../answers.js";
import {
  FORM_SLUG_FIELD,
  HONEYPOT_FIELD,
  RETURN_FIELD,
  SUBMIT_PATH,
  TOKEN_FIELD,
} from "../contract.js";
import { CONFIRMATION } from "../messages.js";
import { validateAnswers } from "../validate.js";
import { buildLabelSnapshot } from "./labels.js";
import { rejectPage } from "./reject-page.js";
import { insertSubmission, recordHandlerFailure } from "./repository.js";
import { isImplausiblyFast, issueTimingToken } from "./timing.js";

// A handler failure is third-party text — an SMTP reply, an upstream
// error page, a URL carrying a token — and it is stored on a row the
// inbox renders. Bounded here rather than at the column, because what
// makes it worth bounding is where it came from.
const MAX_HANDLER_ERROR_CHARS = 1000;

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

/**
 * Back to the page the form was on. Two candidates, in order: the field
 * the re-rendered form carries — after a rejected submit the document is
 * the endpoint, so the browser's own `Referer` would send the retry back
 * here and a POST-only route answers a GET with 404 — then the `Referer`
 * itself. Both are the visitor's to set, so both are held to this site's
 * origin and refused the endpoint: the response can be turned into
 * neither an open redirect nor a loop.
 */
function returnUrl(
  body: URLSearchParams,
  request: Request,
  ctx: AppContext,
): string {
  const origin = URL.parse(ctx.origin)?.origin;
  const submitPath = withBasePath(SUBMIT_PATH, ctx.basePath);
  for (const candidate of [
    body.get(RETURN_FIELD),
    request.headers.get("referer"),
  ]) {
    const url = URL.parse(candidate ?? "");
    if (url !== null && url.origin === origin && url.pathname !== submitPath) {
      return url.href;
    }
  }
  return withBasePath("/", ctx.basePath);
}

// The island asks for JSON; a browser posting the form asks for HTML and
// gets a redirect. One endpoint, because both are the same submission —
// the negotiation is only over what the answer looks like.
function wantsJson(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("application/json");
}

// `no-store` on every one of them: the page carrying the form is
// edge-cached, and these answers are about one visitor's submission.
function jsonResponse(
  body: FormSubmitResponse | { readonly token: string },
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// Nothing about a refused submission belongs in a shared cache either.
function refusal(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * The endpoint the island fetches a timing token from once it hydrates —
 * see {@link issueTimingToken} for why the token cannot travel in the
 * page's markup instead.
 */
export async function tokenHandler(
  _request: Request,
  ctx: AppContext,
): Promise<Response> {
  return jsonResponse({ token: await issueTimingToken(ctx) });
}

/**
 * Run the form's own handler over a submission that is already stored.
 * A throw is caught rather than answered: the visitor's enquiry was
 * received the moment the row was written, and telling them otherwise
 * would have them send it again. The failure is recorded on the row for
 * whoever reads the inbox, and logged for whoever reads the logs.
 *
 * Returns the row as it now stands — carrying the failure when there was
 * one — which is what the post-submit action fires with.
 */
async function runHandler(
  ctx: AppContext,
  form: FormDefinition,
  candidate: FormSubmissionCandidate,
  stored: FormSubmission | null,
): Promise<FormSubmission | null> {
  if (!form.onSubmit) return stored;
  try {
    await form.onSubmit({
      answers: candidate.answers,
      labels: candidate.labels,
      submission: stored,
      ctx,
    });
    return stored;
  } catch (error) {
    const reason = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, MAX_HANDLER_ERROR_CHARS);
    ctx.logger.error("forms: a form's onSubmit threw", {
      form: form.slug,
      submission: stored?.id,
      error,
    });
    if (stored === null) return null;
    try {
      await recordHandlerFailure(ctx, stored.id, reason);
    } catch (failure) {
      // Recording a failure must not become one: throwing here would
      // answer the visitor 500 for an enquiry that is already stored,
      // and they would send it again.
      ctx.logger.error("forms: recording an onSubmit failure failed", {
        form: form.slug,
        submission: stored.id,
        error: failure,
      });
    }
    return { ...stored, handlerError: reason };
  }
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
    if (body === null) return refusal("Payload Too Large", 413);

    const slug = body.get(FORM_SLUG_FIELD);
    const form = slug === null ? undefined : registry.get(slug);
    if (!form) return refusal("Not Found", 404);

    const values = readSubmittedValues(form.fields, body);
    const visible = visibleFields(form.fields, values);
    // A rejected submission, answered in the shape the caller asked for.
    const reject = (errors: readonly FormFieldError[]): Response =>
      wantsJson(request)
        ? jsonResponse({ ok: false, errors }, 422)
        : rejectPage(ctx, form, values, errors, returnUrl(body, request, ctx));

    // Validation comes before the spam floor, and that is what keeps a
    // trapped submission indistinguishable from a real one: a bot that
    // fills the honeypot *and* answers badly is told what a person
    // answering badly is told. The cost is that the form's own `validate`
    // — arbitrary code, which may query the database — runs for spam
    // traffic too, on a route with no rate limit; the alternative tells
    // a bot which half caught it. The `form:validate` filter sits below
    // the floor instead, because it is given the floor's verdict to
    // judge, which is exactly what this cannot be.
    const errors = validateAnswers(form.fields, values);
    if (errors.length > 0) return reject(errors);

    const answers = pickStoredAnswers(form.fields, values);
    const ownErrors = await form.validate?.({ answers, ctx });
    if (ownErrors?.length) return reject(ownErrors);

    // The two halves of the spam floor, and they answer the sender the
    // same way a real submission is answered: telling a bot it was caught
    // only teaches it which half caught it.
    const trapped = (body.get(HONEYPOT_FIELD)?.trim().length ?? 0) > 0;
    const fast = await isImplausiblyFast(ctx, body.get(TOKEN_FIELD));
    const status: SubmissionStatus = trapped || fast ? "spam" : "new";

    // Nothing here grants or refuses anything on the strength of the
    // visitor's address; it is stored, hashed, for whoever reads the inbox.
    const { ipHash, userAgent } = await readVisitorMeta(ctx, request, {
      namespace: "forms",
    });
    const candidate: FormSubmissionCandidate = {
      form: form.slug,
      answers,
      labels: buildLabelSnapshot(visible),
      status,
      ipHash,
      userAgent,
    };

    // The last word before anything is written, and the one seam a spam
    // or compliance plugin needs: it sees a submission every other check
    // has accepted, and the errors it returns reject it like any other.
    const vetoed = await ctx.hooks.applyFilter("form:validate", [], candidate);
    if (vetoed.length > 0) return reject(vetoed);

    const stored = form.store ? await insertSubmission(ctx, candidate) : null;
    // The handler is what tells a person a submission arrived, and a
    // trapped one is not worth telling anyone about — the whole point of
    // the floor is that the notification stops, not merely that the row
    // is labelled. It is still stored, so a false positive is still
    // there to be found; a form that opted out of storage is where the
    // floor costs something, and that is the trade of opting out.
    const submission =
      status === "spam"
        ? stored
        : await runHandler(ctx, form, candidate, stored);
    await ctx.hooks.doAction("form:submitted", submission, candidate);

    return wantsJson(request)
      ? jsonResponse({ ok: true, message: labelSourceText(CONFIRMATION) })
      : new Response(null, {
          status: 303,
          headers: {
            location: returnUrl(body, request, ctx),
            "cache-control": "no-store",
          },
        });
  };
}
