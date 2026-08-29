import type { AppContext } from "plumix/plugin";
import { labelSourceText } from "plumix/i18n";
import { authenticated, base } from "plumix/plugin";
import * as v from "valibot";

import type { FormSubmission } from "./db/schema.js";
import type { FormRegistry } from "./registry.js";
import type {
  FormSummary,
  SubmissionCounts,
  SubmissionDTO,
  SubmissionsPage,
  SubmissionStatus,
} from "./types.js";
import { SUBMISSION_MODERATE_CAPABILITY } from "./contract.js";
import {
  countSubmissions,
  deleteSubmission,
  getSubmission,
  listSubmissions,
  setSubmissionNote,
  setSubmissionStatus,
} from "./server/repository.js";
import { SUBMISSION_STATUSES } from "./types.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function toDto(row: FormSubmission): SubmissionDTO {
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

interface ForbiddenErrors {
  readonly FORBIDDEN: (opts: { data: { capability: string } }) => Error;
}

function requireInboxAccess(ctx: AppContext, errors: ForbiddenErrors): void {
  if (!ctx.auth.can(SUBMISSION_MODERATE_CAPABILITY)) {
    throw errors.FORBIDDEN({
      data: { capability: SUBMISSION_MODERATE_CAPABILITY },
    });
  }
}

const idInput = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

// The two filters every read takes, spelled once: `counts` takes them
// alone, `list` takes them with a page on top.
const filterEntries = {
  form: v.optional(v.pipe(v.string(), v.maxLength(200))),
  status: v.optional(v.picklist(SUBMISSION_STATUSES)),
};

const filterInput = v.optional(v.object(filterEntries), {});

const listInput = v.optional(
  v.object({
    ...filterEntries,
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
    cursor: v.optional(v.pipe(v.string(), v.maxLength(32))),
  }),
  {},
);

export function createSubmissionsRouter(registry: FormRegistry) {
  const definitions = base
    .use(authenticated)
    .handler(({ context, errors }): readonly FormSummary[] => {
      requireInboxAccess(context, errors);
      // The registry is the whole answer: a form is a value in the
      // repository, so there is no table to read and no manifest entry
      // to keep in step with one.
      return registry.list().map((form) => ({
        slug: form.slug,
        title:
          form.title === undefined ? form.slug : labelSourceText(form.title),
      }));
    });

  const list = base
    .use(authenticated)
    .input(listInput)
    .handler(async ({ input, context, errors }): Promise<SubmissionsPage> => {
      requireInboxAccess(context, errors);
      const page = await listSubmissions(context, {
        form: input.form,
        status: input.status,
        limit: Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
        cursor: input.cursor,
      });
      return {
        submissions: page.submissions.map(toDto),
        nextCursor: page.nextCursor,
      };
    });

  const counts = base
    .use(authenticated)
    .input(filterInput)
    .handler(({ input, context, errors }): Promise<SubmissionCounts> => {
      requireInboxAccess(context, errors);
      return countSubmissions(context, input);
    });

  const get = base
    .use(authenticated)
    .input(idInput)
    .handler(async ({ input, context, errors }): Promise<SubmissionDTO> => {
      requireInboxAccess(context, errors);
      const row = await getSubmission(context, input.id);
      if (!row) {
        throw errors.NOT_FOUND({
          data: { kind: "form_submission", id: input.id },
        });
      }
      return toDto(row);
    });

  const setStatus = base
    .use(authenticated)
    .input(
      v.object({
        ...idInput.entries,
        status: v.picklist(SUBMISSION_STATUSES),
      }),
    )
    .handler(
      async ({
        input,
        context,
        errors,
      }): Promise<{ status: SubmissionStatus }> => {
        requireInboxAccess(context, errors);
        const row = await setSubmissionStatus(context, input.id, input.status);
        if (!row) {
          throw errors.NOT_FOUND({
            data: { kind: "form_submission", id: input.id },
          });
        }
        return { status: row.status };
      },
    );

  const setNote = base
    .use(authenticated)
    .input(
      v.object({
        ...idInput.entries,
        note: v.nullable(v.pipe(v.string(), v.maxLength(5000))),
      }),
    )
    .handler(
      async ({ input, context, errors }): Promise<{ note: string | null }> => {
        requireInboxAccess(context, errors);
        // An empty box is no note, not a note that says nothing.
        const note = input.note?.trim() ? input.note : null;
        const row = await setSubmissionNote(context, input.id, note);
        if (!row) {
          throw errors.NOT_FOUND({
            data: { kind: "form_submission", id: input.id },
          });
        }
        return { note: row.note };
      },
    );

  const remove = base
    .use(authenticated)
    .input(idInput)
    .handler(
      async ({ input, context, errors }): Promise<{ deleted: boolean }> => {
        requireInboxAccess(context, errors);
        return { deleted: await deleteSubmission(context, input.id) };
      },
    );

  return { definitions, list, counts, get, setStatus, setNote, remove };
}
