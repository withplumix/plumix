import type { AppContext, McpTool } from "plumix/plugin";
import { McpToolError } from "plumix/plugin";
import * as v from "valibot";

import type { FormRegistry } from "../registry.js";
import { SUBMISSION_MODERATE_CAPABILITY } from "../contract.js";
import { SUBMISSION_STATUSES } from "../types.js";
import { toSubmissionDto } from "./dto.js";
import { formShape, formSummaries } from "./form-shape.js";
import {
  countSubmissions,
  listSubmissions,
  SUBMISSION_PAGE_DEFAULT,
  SUBMISSION_PAGE_MAX,
} from "./repository.js";

const emptyInput = v.object({});

const slugInput = v.object({
  slug: v.pipe(
    v.string(),
    v.maxLength(200),
    v.description("The form's slug, as `form_list` reports it."),
  ),
});

const START_OF_DAY = "00:00:00.000Z";
const END_OF_DAY = "23:59:59.999Z";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// An instant that says where it is. `Date` reads one without a zone in
// whatever timezone the process happens to be in, so the same argument
// would mean different things on Workers and on a developer's machine.
const ZONED_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// A bare `2026-08-24` names a whole UTC day, so each bound is read at its
// own end of it: without that, `until: "2026-08-24"` would land on
// midnight and exclude every submission that day received.
function atEdge(raw: string, edge: string): string {
  return DATE_ONLY.test(raw) ? `${raw}T${edge}` : raw;
}

// Both patterns are matched before parsing rather than after, because
// `Date.parse` accepts `2026-8-24` and `Aug 24 2026` too — and those miss
// `DATE_ONLY`, so they would silently skip the widening above and answer
// for one midnight instead of one day.
function isBound(raw: string, edge: string): boolean {
  if (!DATE_ONLY.test(raw) && !ZONED_INSTANT.test(raw)) return false;
  return !Number.isNaN(Date.parse(atEdge(raw, edge)));
}

function dateBound(edge: string, description: string) {
  return v.pipe(
    v.string(),
    v.trim(),
    v.check(
      (raw) => isBound(raw, edge),
      "expected a UTC date (2026-08-24) or an instant carrying its zone (2026-08-24T09:30:00Z)",
    ),
    v.description(description),
    v.transform((raw) => new Date(atEdge(raw, edge))),
  );
}

const submissionListInput = v.object({
  form: v.optional(
    v.pipe(
      v.string(),
      v.maxLength(200),
      v.description(
        "Only this form's submissions, by slug. Matched against the stored rows, so a form nobody declares any more still answers with its backlog.",
      ),
    ),
  ),
  status: v.optional(
    v.pipe(
      v.picklist(SUBMISSION_STATUSES),
      v.description("Only submissions sitting at this status."),
    ),
  ),
  since: v.optional(
    dateBound(
      START_OF_DAY,
      "Earliest arrival, inclusive — a bare date counts from the start of that UTC day.",
    ),
  ),
  until: v.optional(
    dateBound(
      END_OF_DAY,
      "Latest arrival, inclusive — a bare date counts to the end of that UTC day.",
    ),
  ),
  limit: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(SUBMISSION_PAGE_MAX),
    ),
    SUBMISSION_PAGE_DEFAULT,
  ),
  cursor: v.optional(
    v.pipe(
      v.string(),
      v.maxLength(32),
      v.description("`nextCursor` from the previous page."),
    ),
  ),
});

/**
 * The same gate the inbox is behind, spelled for MCP. Reading forms and
 * reading submissions are one permission: knowing a form exists is of no
 * use to a caller that may not read what was said through it.
 */
function requireInboxAccess(ctx: AppContext): void {
  if (!ctx.auth.can(SUBMISSION_MODERATE_CAPABILITY)) {
    throw McpToolError.forbidden(
      `missing capability: ${SUBMISSION_MODERATE_CAPABILITY}`,
    );
  }
}

/**
 * This plugin's read-only agent surface. There is deliberately no write
 * tool: a form is a value in the repository, so a tool that mutated one
 * would create exactly the environment drift the design exists to avoid —
 * and would do it faster than a person could review.
 */
export function createFormMcpTools(registry: FormRegistry): readonly McpTool[] {
  const formList: McpTool<typeof emptyInput> = {
    name: "form_list",
    description:
      "List the forms this site declares — slug and title. Forms are declared in code, so this reads the registry rather than a table.",
    inputSchema: emptyInput,
    run(ctx) {
      requireInboxAccess(ctx);
      return { forms: formSummaries(registry) };
    },
  };

  const formDescribe: McpTool<typeof slugInput> = {
    name: "form_describe",
    description:
      "Describe one form — its questions, what each answer stores, its choices, and where it breaks into steps.",
    inputSchema: slugInput,
    run(ctx, input) {
      requireInboxAccess(ctx);
      const form = registry.get(input.slug);
      if (form === undefined) {
        throw McpToolError.notFound(`unknown form: "${input.slug}"`);
      }
      return formShape(form);
    },
  };

  const submissionList: McpTool<typeof submissionListInput> = {
    name: "form_submission_list",
    description:
      "List stored form submissions, newest first, filtered by form, status and arrival date. `total` counts everything the filters match, not just the page.",
    inputSchema: submissionListInput,
    async run(ctx, input) {
      requireInboxAccess(ctx);
      const [page, total] = await Promise.all([
        listSubmissions(ctx, input),
        countSubmissions(ctx, input),
      ]);
      return {
        submissions: page.submissions.map(toSubmissionDto),
        total,
        nextCursor: page.nextCursor,
      };
    },
  };

  return [formList, formDescribe, submissionList];
}
