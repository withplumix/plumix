import type { FormSubmission } from "../db/schema.js";
import type { SubmissionDTO } from "../types.js";

/**
 * One stored row as everything outside the database reads it — the inbox
 * over RPC and the export route alike, so the shape an administrator
 * sees on the page is the shape they get in a file.
 */
export function toSubmissionDto(row: FormSubmission): SubmissionDTO {
  return {
    id: row.id,
    form: row.formSlug,
    serial: row.serial,
    status: row.status,
    answers: row.answers,
    labels: row.labels,
    entryId: row.entryId,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
    handlerError: row.handlerError,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
