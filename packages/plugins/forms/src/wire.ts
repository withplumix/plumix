import { useEffect, useState } from "react";
import { labelSourceText } from "plumix/i18n";
import * as v from "valibot";

import type { FormFieldError, FormSubmitResponse } from "./types.js";
import { UNREACHABLE } from "./messages.js";

// Both answers a browser reads off this plugin's endpoints — the token
// below and the submit response under it — are decoded rather than
// asserted: they arrive over `fetch` from a URL a page carries, so what
// comes back is a boundary like any other, and a stale service worker, an
// intercepting proxy or a captive portal all answer 200 with something
// else entirely.
const TokenResponse = v.object({ token: v.string() });

const FieldError = v.object({ field: v.string(), message: v.string() });

// Typed as the response the server declares, so the two halves of one
// wire contract cannot drift apart without a compile error.
export const SubmitResponse: v.GenericSchema<FormSubmitResponse> = v.variant(
  "ok",
  [
    v.object({ ok: v.literal(true), message: v.string() }),
    v.object({ ok: v.literal(false), errors: v.array(FieldError) }),
  ],
);

/**
 * A form definition as it left the server, with the holes JSON punched in
 * it filled back in. Island props cross the wire as JSON, which has no
 * `undefined`: every absent property — a field's `description`, its
 * `visibleWhen`, the form's `title` — arrives as `null`. One pass here is
 * what lets the markup and core's own visibility evaluation read the
 * definition exactly as the server did, rather than every reader down the
 * line learning to spell absence twice.
 */
export function withoutNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => withoutNulls(item)) as T;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, withoutNulls(item)]),
  ) as T;
}

/**
 * What a submission that never reached the endpoint comes back as. It
 * names no field: the summary the plugin's own markup renders reads such
 * an error as text rather than a link to nowhere, and a theme reads it
 * back through `errorFor("")`.
 */
export const unreachable: readonly FormFieldError[] = [
  { field: "", message: labelSourceText(UNREACHABLE) },
];

/**
 * The timing token, fetched once the form is live. Both browser surfaces
 * ask for it the same way, so a form driven by a theme's own controls
 * meets the same spam floor as the rendered one.
 */
export function useTimingToken(tokenPath: string): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const aborter = new AbortController();
    void (async () => {
      try {
        const response = await fetch(tokenPath, {
          headers: { accept: "application/json" },
          signal: aborter.signal,
        });
        const payload = v.safeParse(TokenResponse, await response.json());
        if (payload.success) setToken(payload.output.token);
      } catch {
        // A form that could not get a token still submits: the server
        // treats a submission carrying none as one it cannot time, which
        // is exactly how it treats every no-JavaScript submission.
      }
    })();
    return () => {
      aborter.abort();
    };
  }, [tokenPath]);
  return token;
}
