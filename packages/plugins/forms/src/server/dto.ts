import type { StoredSubmission } from "../db/schema.js";
import type { SubmissionDTO } from "../types.js";

export function toSubmissionDto(row: StoredSubmission): SubmissionDTO {
  return {
    id: row.id,
    form: row.form,
    status: row.status,
    answers: row.answers,
    labels: row.labels,
    bound: row.bound,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
    handlerError: row.handlerError,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
