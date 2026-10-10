import type { JsonObject } from "plumix";
import * as v from "valibot";

import { RETURN_FIELD } from "../contract.js";

/**
 * The two fields a form cannot post as numbers. Coerced here rather than
 * by loosening the schema, so `entryId=12abc` stays a refusal on both
 * paths instead of quietly becoming 12.
 */
const NUMERIC_FIELDS = ["entryId", "parentId"] as const;

const optionalString = v.fallback(v.optional(v.string()), undefined);
const optionalNumber = v.fallback(v.optional(v.number()), undefined);

/**
 * Parsed so non-strings never reach a control and the honeypot can't be echoed
 * back. Every key is optional: a refusal re-renders the form even for a
 * non-comment body.
 */
const echoedSchema = v.object({
  name: optionalString,
  email: optionalString,
  body: optionalString,
  entryId: optionalNumber,
  parentId: optionalNumber,
  [RETURN_FIELD]: optionalString,
});

type EchoedComment = Partial<v.InferOutput<typeof echoedSchema>>;

/** One submitted comment, decoded, before anything has judged it. */
export interface Submission {
  /**
   * The answer's shape is negotiated on this, not `Accept`: `fetch` sends none,
   * and scripted callers would flip to the redirect.
   */
  readonly form: boolean;
  /** The decoded body, or null when it could not be read at all. */
  readonly body: { readonly raw: unknown } | null;
  readonly echoed: EchoedComment;
}

export function isFormEncoded(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").includes(
    "application/x-www-form-urlencoded",
  );
}

function readFormBody(text: string): JsonObject {
  const body = new URLSearchParams(text);
  const out: Record<string, string | number> = Object.fromEntries(body);
  for (const key of NUMERIC_FIELDS) {
    const value = out[key];
    if (typeof value !== "string") continue;
    // An untouched control posts "". Dropped so an absent parent takes the
    // schema default; non-numbers stay strings for the schema to refuse.
    if (value === "") {
      delete out[key];
      continue;
    }
    const number = Number(value);
    if (Number.isFinite(number)) out[key] = number;
  }
  return out;
}

export async function readSubmission(request: Request): Promise<Submission> {
  const form = isFormEncoded(request);
  const body = await readBody(request, form);
  const parsed = v.safeParse(echoedSchema, body?.raw);
  return { form, body, echoed: parsed.success ? parsed.output : {} };
}

/** Only a JSON body can fail to read; urlencoded always parses. */
async function readBody(
  request: Request,
  form: boolean,
): Promise<{ readonly raw: unknown } | null> {
  if (form) return { raw: readFormBody(await request.text()) };
  try {
    return { raw: await request.json() };
  } catch {
    return null;
  }
}
