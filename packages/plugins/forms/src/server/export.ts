import type { AppContext } from "plumix/plugin";

import type { AnswerWords } from "../answer-lines.js";
import type {
  SubmissionDTO,
  SubmissionFilter,
  SubmissionStatus,
} from "../types.js";
import { answerText } from "../answer-lines.js";
import { submissionColumns } from "../columns.js";
import { SUBMISSION_STATUSES } from "../types.js";
import { toCsv } from "./csv.js";
import { toSubmissionDto } from "./dto.js";
import { listAllSubmissions } from "./repository.js";

/**
 * Deliberately untranslated: scripts and formulas key on stable column
 * names, which is also why `status` is the stored identifier.
 */
const ENVELOPE = ["Received", "Form", "Number", "Status"] as const;
const NOTE_COLUMN = "Note";

/**
 * The two words a stored checkbox answer reads as, in the same English
 * the envelope is written in.
 */
const WORDS: AnswerWords = { yes: "Yes", no: "No" };

/**
 * Submissions as a spreadsheet reads them: the envelope, then a column
 * per question — see {@link submissionColumns} for where those come from
 * — then the administrator's own note.
 */
export function submissionsToCsv(rows: readonly SubmissionDTO[]): string {
  const columns = submissionColumns(rows);
  return toCsv([
    [...ENVELOPE, ...columns.map((column) => column.label), NOTE_COLUMN],
    ...rows.map((row) => [
      row.createdAt,
      row.form,
      String(row.id),
      row.status,
      ...columns.map((column) =>
        answerText(row.answers[column.key], row.labels[column.key], WORDS),
      ),
      row.note ?? "",
    ]),
  ]);
}

/** Includes fields the CSV leaves out. Indented, since people read it first. */
export function submissionsToJson(rows: readonly SubmissionDTO[]): string {
  return JSON.stringify(rows, null, 2);
}

/**
 * Keyed by what `?format=` is asked for, which is also the extension the
 * file is named with.
 */
const FORMATS = {
  csv: { contentType: "text/csv; charset=utf-8", write: submissionsToCsv },
  json: {
    contentType: "application/json; charset=utf-8",
    write: submissionsToJson,
  },
} as const;

type ExportFormat = keyof typeof FORMATS;

function isFormat(value: string): value is ExportFormat {
  return Object.hasOwn(FORMATS, value);
}

function isStatus(value: string): value is SubmissionStatus {
  return (SUBMISSION_STATUSES as readonly string[]).includes(value);
}

function badRequest(reason: string): Response {
  return new Response(reason, {
    status: 400,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

const UNSAFE_FILENAME = /[^a-zA-Z0-9-]/g;

/** The slug comes from a stored row, so it is sanitized for a filename. */
function exportFilename(filter: SubmissionFilter): string {
  const parts = ["submissions", filter.form, filter.status].filter(
    (part) => part !== undefined,
  );
  return parts.map((part) => part.replaceAll(UNSAFE_FILENAME, "-")).join("-");
}

/** A stray `?form=` means no filter, not an empty match. */
function queryValue(query: URLSearchParams, name: string): string | undefined {
  const value = query.get(name);
  return value === null || value === "" ? undefined : value;
}

/**
 * Columns come from every row's snapshot, so exports are held whole in
 * memory. Past this they are refused, never truncated.
 */
export const EXPORT_MAX_ROWS = 20_000;

/**
 * An unrecognised format or status is refused, not ignored, so a typo
 * can't export everything.
 */
export function createExportHandler(maxRows = EXPORT_MAX_ROWS) {
  return async function exportHandler(
    request: Request,
    ctx: AppContext,
  ): Promise<Response> {
    return handleExport(request, ctx, maxRows);
  };
}

async function handleExport(
  request: Request,
  ctx: AppContext,
  maxRows: number,
): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const format = queryValue(query, "format") ?? "csv";
  if (!isFormat(format)) return badRequest("unknown_format");
  const status = queryValue(query, "status");
  if (status !== undefined && !isStatus(status)) {
    return badRequest("unknown_status");
  }
  const filter: SubmissionFilter = { form: queryValue(query, "form"), status };
  // One past the ceiling, so that having too many to serve is something
  // the read itself answers.
  const rows = await listAllSubmissions(ctx, filter, maxRows + 1);
  if (rows.length > maxRows) {
    return new Response(
      `This export holds more than ${String(maxRows)} submissions, which is ` +
        `more than one file can carry. Narrow it by form or by status.`,
      { status: 413, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  const { contentType, write } = FORMATS[format];
  return new Response(write(rows.map(toSubmissionDto)), {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${exportFilename(filter)}.${format}"`,
      // Belt and braces beside the attachment disposition: whatever a
      // visitor typed is in this body, and nothing should sniff it into
      // a content type it can run.
      "x-content-type-options": "nosniff",
      // The answers of everyone who wrote in. Nothing between here and
      // the browser has any business keeping a copy.
      "cache-control": "private, no-store",
    },
  });
}
