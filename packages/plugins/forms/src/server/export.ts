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
 * The envelope every submission carries, whichever form it answered,
 * and the note column that closes the row.
 *
 * Deliberately not translated, unlike everything the inbox renders. The
 * answer columns between these are named by the form's own label
 * snapshot — in whatever language that form was written — so a
 * translated envelope beside untranslated columns reads worse than a
 * consistent one. And an export is a file another program reads: a
 * stable column name is what a script or a spreadsheet formula keys on,
 * which is also why `status` is written as the stored identifier rather
 * than as the word the inbox shows. `formatSubmission` settles the same
 * question the same way.
 */
const ENVELOPE = ["Received", "Form", "Number", "Status"] as const;
const NOTE_COLUMN = "Note";

// The two words a stored checkbox answer reads as, in the same English
// the envelope is written in.
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

/**
 * Submissions as another program reads them: the whole row, answers
 * nested as they were stored and the envelope the CSV leaves out — what
 * the form was bound to, the hashed address, the agent, whatever
 * the form's own handler failed at. Indented, because the first thing
 * done with an export is to look at it.
 */
export function submissionsToJson(rows: readonly SubmissionDTO[]): string {
  return JSON.stringify(rows, null, 2);
}

// Keyed by what `?format=` is asked for, which is also the extension the
// file is named with.
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

// Named for what is in it, so two exports taken under different filters
// do not land in the downloads folder as one file and its copy. A stored
// row's slug is not the site's own, so it is filtered to what a filename
// may hold rather than trusted.
function exportFilename(filter: SubmissionFilter): string {
  const parts = ["submissions", filter.form, filter.status].filter(
    (part) => part !== undefined,
  );
  return parts.map((part) => part.replaceAll(UNSAFE_FILENAME, "-")).join("-");
}

// An empty parameter is no filter rather than a filter on the empty
// value: the inbox leaves out what it is not filtering by, and a stray
// `?form=` would otherwise match nothing and export an empty file.
function queryValue(query: URLSearchParams, name: string): string | undefined {
  const value = query.get(name);
  return value === null || value === "" ? undefined : value;
}

/**
 * How many submissions one file can carry. The columns come from the
 * rows' own snapshots, so nothing can be written until the last row is
 * read — an export is held whole in memory by construction, and a Worker
 * isolate has a ceiling. Past this the export is refused rather than
 * truncated: a file that looks complete and is not is the worse answer.
 */
export const EXPORT_MAX_ROWS = 20_000;

/**
 * Every submission the inbox's own filters name, as a file. An
 * unrecognised format or status is refused rather than dropped — writing
 * every submission to disk because a query parameter was misspelt is the
 * wrong answer to a typo.
 *
 * `maxRows` is the ceiling above, taken as an argument so a test can
 * reach the refusal without seeding twenty thousand rows.
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
