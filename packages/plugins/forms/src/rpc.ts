import { authenticated, base, requireCapability } from "plumix/plugin";
import * as v from "valibot";

import type { FormRegistry } from "./registry.js";
import type {
  FormSummary,
  SubmissionCounts,
  SubmissionDTO,
  SubmissionsPage,
  SubmissionStatus,
} from "./types.js";
import { SUBMISSION_MODERATE_CAPABILITY } from "./contract.js";
import { toSubmissionDto } from "./server/dto.js";
import { formSummaries } from "./server/form-shape.js";
import {
  countSubmissionFacets,
  deleteSubmission,
  getSubmission,
  listSubmissions,
  setSubmissionNote,
  setSubmissionStatus,
  SUBMISSION_PAGE_DEFAULT,
  SUBMISSION_PAGE_MAX,
} from "./server/repository.js";
import { SUBMISSION_STATUSES } from "./types.js";

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
    .use(requireCapability(SUBMISSION_MODERATE_CAPABILITY))
    .handler((): readonly FormSummary[] => {
      return formSummaries(registry);
    });

  const list = base
    .use(authenticated)
    .use(requireCapability(SUBMISSION_MODERATE_CAPABILITY))
    .input(listInput)
    .handler(async ({ input, context }): Promise<SubmissionsPage> => {
      const page = await listSubmissions(context, {
        form: input.form,
        status: input.status,
        limit: Math.min(
          input.limit ?? SUBMISSION_PAGE_DEFAULT,
          SUBMISSION_PAGE_MAX,
        ),
        cursor: input.cursor,
      });
      return {
        submissions: page.submissions.map(toSubmissionDto),
        nextCursor: page.nextCursor,
      };
    });

  const counts = base
    .use(authenticated)
    .use(requireCapability(SUBMISSION_MODERATE_CAPABILITY))
    .input(filterInput)
    .handler(({ input, context }): Promise<SubmissionCounts> => {
      return countSubmissionFacets(context, input);
    });

  const get = base
    .use(authenticated)
    .use(requireCapability(SUBMISSION_MODERATE_CAPABILITY))
    .input(idInput)
    .handler(async ({ input, context, errors }): Promise<SubmissionDTO> => {
      const row = await getSubmission(context, input.id);
      if (!row) {
        throw errors.NOT_FOUND({
          data: { kind: "form_submission", id: input.id },
        });
      }
      return toSubmissionDto(row);
    });

  const setStatus = base
    .use(authenticated)
    .use(requireCapability(SUBMISSION_MODERATE_CAPABILITY))
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
    .use(requireCapability(SUBMISSION_MODERATE_CAPABILITY))
    .input(
      v.object({
        ...idInput.entries,
        note: v.nullable(v.pipe(v.string(), v.maxLength(5000))),
      }),
    )
    .handler(
      async ({ input, context, errors }): Promise<{ note: string | null }> => {
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
    .use(requireCapability(SUBMISSION_MODERATE_CAPABILITY))
    .input(idInput)
    .handler(async ({ input, context }): Promise<{ deleted: boolean }> => {
      return { deleted: await deleteSubmission(context, input.id) };
    });

  return { definitions, list, counts, get, setStatus, setNote, remove };
}
