import { useCallback, useEffect } from "react";
import { useLingui } from "@lingui/react";
import * as v from "valibot";

import type { Label } from "@plumix/core/i18n";

// Client half of the path-addressed meta write-rejection contract: the
// server aggregates constraint failures as `{ path, message }` under
// `CONFLICT.data.errors` (see `sanitizeMetaForRpc` in core); these
// helpers pull them off the wire and pin each onto the react-hook-form
// input it addresses, so `<FormMessage />` renders it inline.

/** Where every admin form keeps its meta bag in the RHF values. */
// RHF path segment, not display copy.
// eslint-disable-next-line lingui/no-unlocalized-strings
export const META_FORM_BASE_PATH = "meta";

export interface MetaFieldServerError {
  /** Dot-joined from the top-level meta key into nested repeater cells
   *  (`sections.2.heading`) — matches the RHF registration path minus
   *  the form's base path. */
  readonly path: string;
  /** Plain string (custom `.validate()` verdicts) or an i18n message
   *  descriptor resolved against the admin catalog. */
  readonly message: Label;
}

/** Pull the path-addressed field rejections off an oRPC write error.
 *  Returns `undefined` when the error carries none — callers fall back
 *  to their existing banner mapping. */
export function extractMetaFieldErrors(
  err: unknown,
): readonly MetaFieldServerError[] | undefined {
  const envelope = v.safeParse(errorEnvelopeSchema, err);
  if (!envelope.success) return undefined;
  const errors = envelope.output.data.errors.filter(isMetaFieldServerError);
  return errors.length > 0 ? errors : undefined;
}

// The oRPC error the rejections travel inside. Only the envelope is described
// here — each entry is checked on its own below, so one malformed rejection
// does not discard the rest.
const errorEnvelopeSchema = v.looseObject({
  data: v.looseObject({ errors: v.array(v.unknown()) }),
});

// The wire form of `MetaFieldServerError`. A descriptor is matched on its `id`
// alone — the rest of what Lingui puts on one is the catalog's business, and
// `useMetaFieldMessage` reads it off the original value either way, since this
// is a predicate and the parsed output is discarded.
const serverErrorSchema = v.object({
  path: v.string(),
  message: v.union([v.string(), v.object({ id: v.string() })]),
});

function isMetaFieldServerError(item: unknown): item is MetaFieldServerError {
  return v.is(serverErrorSchema, item);
}

/** Resolver for server error messages. Unlike `useLabel`, interpolates
 *  a descriptor's `values` (`{max}` → `5`) — constraint messages carry
 *  their bound on the wire. */
export function useMetaFieldMessage(): (message: Label) => string {
  const { i18n } = useLingui();
  return useCallback(
    (message) => {
      if (typeof message === "string") return message;
      return i18n._(message.id, message.values, { message: message.message });
    },
    [i18n],
  );
}

/**
 * Pin each server rejection onto its form input. `setError` is the
 * form's `form.setError`; `basePath` is where the meta bag lives in
 * the form values (`"meta"` for every entity form; the settings card
 * keeps its fields at the root and passes `""`). Idempotent per
 * submit — RHF clears field errors on the next change/submit cycle.
 */
export function applyMetaFieldErrors(
  setError: (name: never, error: { type: string; message: string }) => void,
  basePath: string,
  errors: readonly MetaFieldServerError[],
  resolveMessage: (message: Label) => string,
): void {
  // Shallowest paths first: RHF's `setError` on a parent path replaces
  // that subtree, so a repeater-root error applied after its cell
  // errors would wipe them.
  const ordered = [...errors].sort(
    (a, b) => a.path.split(".").length - b.path.split(".").length,
  );
  for (const error of ordered) {
    const name = basePath === "" ? error.path : `${basePath}.${error.path}`;
    setError(name as never, {
      type: "server",
      message: resolveMessage(error.message),
    });
  }
}

/**
 * Effect form of `applyMetaFieldErrors` for forms that receive server
 * rejections as a prop/state: applies whenever `errors` changes, and
 * clears the meta subtree's errors when it goes back to `null` (a
 * subsequent save succeeded). Submit-driven forms also self-clear on
 * the next `handleSubmit`.
 */
export function useApplyMetaFieldErrors(
  form: {
    setError: (name: never, error: { type: string; message: string }) => void;
    clearErrors: (name?: never) => void;
  },
  basePath: string,
  errors: readonly MetaFieldServerError[] | null | undefined,
): void {
  const resolveMessage = useMetaFieldMessage();
  useEffect(() => {
    // Always clear first — a *new* error set must not leave stale
    // pins from the previous failed save on now-valid inputs (the
    // entry editor replaces the array across consecutive autosaves).
    form.clearErrors(basePath as never);
    if (!errors || errors.length === 0) return;
    applyMetaFieldErrors(form.setError, basePath, errors, resolveMessage);
    // `form` methods are stable per RHF instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors, basePath, resolveMessage]);
}
