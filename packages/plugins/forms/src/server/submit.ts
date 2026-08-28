import type { AppContext } from "plumix/plugin";
import { withBasePath } from "plumix";
import { readVisitorMeta } from "plumix/db";
import { labelSourceText } from "plumix/i18n";

import type { SubmittedValues } from "../answers.js";
import type { FormDefinition } from "../define-form.js";
import type { FormRegistry } from "../registry.js";
import type {
  FormFieldError,
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
import { buildLabelSnapshot } from "./labels.js";
import { rejectPage } from "./reject-page.js";
import { insertSubmission } from "./repository.js";
import { isImplausiblyFast, issueTimingToken } from "./timing.js";
import { validateAnswers } from "./validate.js";

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

// A rejected submission, answered in the shape the caller asked for.
function rejected(
  request: Request,
  ctx: AppContext,
  form: FormDefinition,
  values: SubmittedValues,
  errors: readonly FormFieldError[],
  returnTo: string,
): Response {
  return wantsJson(request)
    ? jsonResponse({ ok: false, errors }, 422)
    : rejectPage(ctx, form, values, errors, returnTo);
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

    // Validation comes before the spam floor, and that is what keeps a
    // trapped submission indistinguishable from a real one: a bot that
    // fills the honeypot *and* answers badly is told what a person
    // answering badly is told. Nothing is lost by not filing it as spam —
    // a submission that fails validation is stored for nobody.
    const errors = validateAnswers(visible, values);
    if (errors.length > 0) {
      return rejected(
        request,
        ctx,
        form,
        values,
        errors,
        returnUrl(body, request, ctx),
      );
    }

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
    await insertSubmission(ctx, {
      formSlug: form.slug,
      status,
      answers: pickStoredAnswers(visible, values),
      labels: buildLabelSnapshot(visible),
      ipHash,
      userAgent,
    });

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
