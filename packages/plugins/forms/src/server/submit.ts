import type { AppContext } from "plumix/plugin";
import { resolveReturnUrl } from "plumix/auth";
import { readVisitorMeta } from "plumix/db";
import { labelSourceText } from "plumix/i18n";

import type { StoredSubmission } from "../db/schema.js";
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
  BOUND_FIELD,
  FORM_SLUG_FIELD,
  HONEYPOT_FIELD,
  RETURN_FIELD,
  SUBMIT_PATH,
  TOKEN_FIELD,
  TURNSTILE_FIELD,
} from "../contract.js";
import { CAPTCHA_FAILED, CONFIRMATION } from "../messages.js";
import { validateAnswers } from "../validate.js";
import { verifyBound } from "./binding.js";
import { buildLabelSnapshot } from "./labels.js";
import { rejectPage } from "./reject-page.js";
import { insertSubmission, recordHandlerFailure } from "./repository.js";
import { isImplausiblyFast, issueTimingToken } from "./timing.js";
import { verifyTurnstile } from "./turnstile.js";

// Third-party text, such as an SMTP reply or error page, stored on a row
// the inbox renders.
const MAX_HANDLER_ERROR_CHARS = 1000;

// Counted as it streams: a chunked body has no `content-length`.
const MAX_BODY_BYTES = 64 * 1024;

// Urlencoded only: multipart would mean file uploads, which this plugin
// deliberately refuses.
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

// A throw is recorded, not answered: the row is stored, and an error
// would make the visitor resend.
async function runHandler(
  ctx: AppContext,
  form: FormDefinition,
  candidate: FormSubmissionCandidate,
  stored: StoredSubmission | null,
): Promise<StoredSubmission | null> {
  if (!form.onSubmit) return stored;
  try {
    await form.onSubmit({
      answers: candidate.answers,
      labels: candidate.labels,
      bound: candidate.bound,
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
 * Must read no session: as a `formPost` route only the Origin check
 * guards it. Spam is answered like a real submission.
 */
export function createSubmitHandler(registry: FormRegistry) {
  return async (request: Request, ctx: AppContext): Promise<Response> => {
    const body = await readBoundedBody(request);
    if (body === null) return refusal("Payload Too Large", 413);

    const slug = body.get(FORM_SLUG_FIELD);
    const form = slug === null ? undefined : registry.get(slug);
    if (!form) return refusal("Not Found", 404);

    // An unsigned token is refused outright. Only a binding form looks, so
    // removing `bind` doesn't break cached pages.
    const bind = form.bind;
    const token = bind === undefined ? null : body.get(BOUND_FIELD);
    const signed =
      token === null ? null : await verifyBound(ctx, form.slug, token);
    if (token !== null && signed === null) return refusal("Forbidden", 403);
    // A kind the form no longer binds (cached pages after a `bind` change)
    // is stored as nothing rather than refused.
    const bound = signed?.type === bind ? signed : null;

    const values = readSubmittedValues(form.fields, body);
    const visible = visibleFields(form.fields, values);
    const returnTo = resolveReturnUrl(request, ctx, {
      returnTo: body.get(RETURN_FIELD),
      endpoint: SUBMIT_PATH,
    });

    // A rejected submission, answered in the shape the caller asked for.
    const reject = (errors: readonly FormFieldError[]): Response =>
      wantsJson(request)
        ? jsonResponse({ ok: false, errors }, 422)
        : rejectPage(ctx, form, {
            values,
            errors,
            returnTo,
            // Re-emitting the verified token grants nothing new.
            bound: token,
          });

    // Before the spam floor, so a trapped bot gets a person's answer. The
    // cost: the form's `validate` runs for spam traffic too.
    const errors = validateAnswers(form.fields, values);
    if (errors.length > 0) return reject(errors);

    const answers = pickStoredAnswers(form.fields, values);
    const ownErrors = await form.validate?.({ answers, bound, ctx });
    if (ownErrors?.length) return reject(ownErrors);

    // After field rules, so invalid submissions cost no subrequest. Before
    // the spam floor, because the visitor sees this check.
    if (
      form.turnstile !== undefined &&
      !(await verifyTurnstile(ctx, form.turnstile, body.get(TURNSTILE_FIELD)))
    ) {
      return reject([
        { field: TURNSTILE_FIELD, message: labelSourceText(CAPTCHA_FAILED) },
      ]);
    }

    const trapped = (body.get(HONEYPOT_FIELD)?.trim().length ?? 0) > 0;
    const fast = await isImplausiblyFast(ctx, body.get(TOKEN_FIELD));
    const status: SubmissionStatus = trapped || fast ? "spam" : "new";

    // Nothing here grants or refuses anything on the strength of the
    // visitor's address; it is stored, hashed, for whoever reads the inbox.
    const { ipHash, userAgent } = await readVisitorMeta(ctx, {
      namespace: "forms",
    });
    const candidate: FormSubmissionCandidate = {
      form: form.slug,
      answers,
      labels: buildLabelSnapshot(visible),
      status,
      bound,
      ipHash,
      userAgent,
    };

    const vetoed = await ctx.hooks.applyFilter("form:validate", [], candidate);
    if (vetoed.length > 0) return reject(vetoed);

    const stored = form.store ? await insertSubmission(ctx, candidate) : null;
    // Spam skips the handler, so no notification goes out; it is still
    // stored, unless the form opted out of storage.
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
            location: returnTo,
            "cache-control": "no-store",
          },
        });
  };
}
