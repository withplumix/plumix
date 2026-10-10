import { useEffect, useState } from "react";
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "plumix/blocks";
import { labelSourceText } from "plumix/i18n";
import * as v from "valibot";

import type { FormFieldError, FormSubmitResponse } from "./types.js";
import { UNREACHABLE } from "./messages.js";

/**
 * Decoded: a stale service worker or captive portal can answer 200 with
 * something else.
 */
const TokenResponse = v.object({ token: v.string() });

const FieldError = v.object({ field: v.string(), message: v.string() });

/**
 * Typed as the response the server declares, so the two halves of one
 * wire contract cannot drift apart without a compile error.
 */
const SubmitResponse: v.GenericSchema<FormSubmitResponse> = v.variant("ok", [
  v.object({ ok: v.literal(true), message: v.string() }),
  v.object({ ok: v.literal(false), errors: v.array(FieldError) }),
]);

/**
 * Island props arrive as JSON, where every absent property became `null`;
 * this restores `undefined`.
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

/** Names no field; a theme reads it back through `errorFor("")`. */
export const unreachable: readonly FormFieldError[] = [
  { field: "", message: labelSourceText(UNREACHABLE) },
];

/** Never rejects; any failure or unexpected reply is {@link unreachable}. */
export async function postSubmission(
  action: string,
  body: URLSearchParams,
): Promise<FormSubmitResponse | "unreachable"> {
  try {
    const response = await fetch(action, {
      method: "POST",
      headers: {
        accept: "application/json",
        // The header a plain form cannot set. Sending it puts this
        // submission through the ordinary CSRF gate rather than the
        // `formPost` exemption the no-JavaScript path takes.
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      },
      // A `URLSearchParams` body is sent urlencoded, exactly as the
      // plain form posts it, and sets its own content type.
      body,
    });
    const payload = v.safeParse(SubmitResponse, await response.json());
    return payload.success ? payload.output : "unreachable";
  } catch {
    return "unreachable";
  }
}

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
        // Submits untimed, like any no-JavaScript submission.
      }
    })();
    return () => {
      aborter.abort();
    };
  }, [tokenPath]);
  return token;
}
