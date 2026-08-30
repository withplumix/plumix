import { Factory } from "fishery";

import type { FormSubmission, NewFormSubmission } from "../db/schema.js";
import type {
  FormBound,
  FormLabelSnapshot,
  SubmissionStatus,
} from "../types.js";
import type { FormsTestDb } from "./db.js";
import { formSubmissions } from "../db/schema.js";
import { boundColumns, storeLabelSnapshot } from "../server/repository.js";

interface DbTransient {
  db: FormsTestDb;
}

/** What a seed hands in: the row, with the labels and the bound pair as
 *  the values they stand for rather than as the columns they are. */
type SubmissionSeed = Omit<
  NewFormSubmission,
  "labelsDigest" | "boundType" | "boundId"
> & {
  labels: FormLabelSnapshot;
  bound: FormBound | null;
};

/**
 * Seeds one `form_submissions` row. `form` is required — a submission
 * belongs to a form — and everything else has a default. `labels` is
 * taken as the snapshot itself rather than as its digest: the row points
 * at one, and the seed writes it the same way a submission does.
 */
export const submissionFactory = Factory.define<
  SubmissionSeed,
  DbTransient,
  FormSubmission,
  // Fourth parameter, as core's own factories declare it: without it
  // fishery deep-partials `params`, and the JSON columns stop matching
  // the types the table declares for them.
  Partial<SubmissionSeed>
>(({ sequence, transientParams, onCreate, params }) => {
  onCreate(async ({ labels, bound, ...attrs }) => {
    const db = transientParams.db;
    if (!db) {
      // eslint-disable-next-line no-restricted-syntax -- test-support guard
      throw new Error("submissionFactory requires a db via .transient({ db })");
    }
    const labelsDigest = await storeLabelSnapshot(db, labels);
    const [row] = await db
      .insert(formSubmissions)
      .values({ ...attrs, labelsDigest, ...boundColumns(bound) })
      .returning();
    // eslint-disable-next-line no-restricted-syntax -- test-support guard
    if (!row) throw new Error("submissionFactory: insert returned no row");
    return row;
  });

  const form = params.form;
  if (form === undefined) {
    // eslint-disable-next-line no-restricted-syntax -- test-support guard
    throw new Error("submissionFactory: form is required");
  }

  return {
    form,
    status: params.status ?? "new",
    answers: params.answers ?? { name: `Visitor ${String(sequence)}` },
    labels: params.labels ?? { name: { label: "Your name" } },
    bound: params.bound ?? null,
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
  form: string,
  day: string,
  status: SubmissionStatus = "new",
): Promise<FormSubmission> {
  return submissionFactory
    .transient({ db })
    .create({ form, status, createdAt: new Date(`${day}T12:00:00.000Z`) });
}
