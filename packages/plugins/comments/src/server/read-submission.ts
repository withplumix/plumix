import type { JsonObject } from "plumix";
import * as v from "valibot";

import { RETURN_FIELD } from "../contract.js";

// The two fields a form cannot post as numbers. Coerced here rather than
// by loosening the schema, so `entryId=12abc` stays a refusal on both
// paths instead of quietly becoming 12.
const NUMERIC_FIELDS = ["entryId", "parentId"] as const;

const optionalString = v.fallback(v.optional(v.string()), undefined);
const optionalNumber = v.fallback(v.optional(v.number()), undefined);

/**
 * What the visitor typed, as it goes back into the form they are handed,
 * and where they came from. Parsed rather than read off the body: a value
 * that is not a string is not something to put in a control, and the
 * honeypot is not in the shape at all, so it can never be echoed back and
 * filled in for the bot that tripped it.
 *
 * Every key is optional, because a body that reached no schema still has
 * to render something — a refusal is answered with the form back, and the
 * form has to be there even when what was posted was not a comment.
 */
const echoedSchema = v.object({
  name: optionalString,
  email: optionalString,
  body: optionalString,
  entryId: optionalNumber,
  parentId: optionalNumber,
  [RETURN_FIELD]: optionalString,
});

export type EchoedComment = Partial<v.InferOutput<typeof echoedSchema>>;

/** One submitted comment, decoded, before anything has judged it. */
export interface Submission {
  /**
   * True when the body arrived urlencoded — a browser posting a plain
   * form rather than a script posting JSON. It is what the answer's shape
   * is negotiated on: `Accept` cannot serve, because a `fetch` sends none
   * of its own and every existing scripted caller would flip to the
   * redirect.
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
    // A control the visitor left alone posts an empty string. Dropped
    // rather than coerced, so an absent parent falls to the schema's own
    // default instead of failing it; anything that is not a number is
    // left as the string it was, for the schema to refuse.
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

/**
 * The submitted body, or null when it could not be read at all — which
 * only a JSON caller can manage, since a urlencoded body always parses.
 */
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
