import { Factory } from "fishery";

import type { FormSubmission, NewFormSubmission } from "../db/schema.js";
import type { SubmissionStatus } from "../types.js";
import type { FormsTestDb } from "./db.js";
import { formSubmissions } from "../db/schema.js";

interface DbTransient {
  db: FormsTestDb;
}

/**
 * Seeds one `form_submissions` row. `formSlug` and `serial` are required
 * — a submission belongs to a form and carries the number a person can
 * quote — and everything else has a default. The submit handler
 * allocates serials from the rows already there, so a seeded row and a
 * real submission to the same form do not collide as long as the seed
 * takes the low numbers.
 */
export const submissionFactory = Factory.define<
  NewFormSubmission,
  DbTransient,
  FormSubmission,
  // Fourth parameter, as core's own factories declare it: without it
  // fishery deep-partials `params`, and the JSON columns stop matching
  // the types the table declares for them.
  Partial<NewFormSubmission>
>(({ sequence, transientParams, onCreate, params }) => {
  onCreate(async (attrs) => {
    const db = transientParams.db;
    if (!db) {
      // eslint-disable-next-line no-restricted-syntax -- test-support guard
      throw new Error("submissionFactory requires a db via .transient({ db })");
    }
    const [row] = await db.insert(formSubmissions).values(attrs).returning();
    // eslint-disable-next-line no-restricted-syntax -- test-support guard
    if (!row) throw new Error("submissionFactory: insert returned no row");
    return row;
  });

  const formSlug = params.formSlug;
  if (formSlug === undefined) {
    // eslint-disable-next-line no-restricted-syntax -- test-support guard
    throw new Error("submissionFactory: formSlug is required");
  }

  return {
    formSlug,
    serial: params.serial ?? sequence,
    status: params.status ?? "new",
    answers: params.answers ?? { name: `Visitor ${String(sequence)}` },
    labels: params.labels ?? { name: { label: "Your name" } },
    entryId: params.entryId ?? null,
    ipHash: params.ipHash ?? null,
    userAgent: params.userAgent ?? null,
    handlerError: params.handlerError ?? null,
    note: params.note ?? null,
  };
});

/**
 * One submission dated to a named day, for the reads that filter on when
 * it arrived — `insertSubmission` stamps its own date, so only a seeded
 * row can sit anywhere but now.
 */
export function seedSubmissionOn(
  db: FormsTestDb,
  formSlug: string,
  day: string,
  status: SubmissionStatus = "new",
): Promise<FormSubmission> {
  return submissionFactory
    .transient({ db })
    .create({ formSlug, status, createdAt: new Date(`${day}T12:00:00.000Z`) });
}
