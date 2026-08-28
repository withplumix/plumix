import * as v from "valibot";

import type { FormSubmitResponse } from "../types.js";

/**
 * The two answers the island reads off the network. Both are decoded
 * rather than asserted: they arrive over `fetch` from a URL a page
 * carries, so what comes back is a boundary like any other — a stale
 * service worker, an intercepting proxy or a captive portal all answer
 * 200 with something else entirely.
 */
export const TokenResponse = v.object({ token: v.string() });

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
