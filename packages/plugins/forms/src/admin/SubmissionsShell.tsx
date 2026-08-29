import type { MessageDescriptor } from "plumix/i18n";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  destructiveGhostClassName,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "plumix/admin/ui";
import { formatDate, Trans, useLingui } from "plumix/i18n";

import type { AnswerWords } from "../answer-lines.js";
import type { SubmissionStatus } from "../types.js";
import type { SubmissionFilter } from "./rpc.js";
import { answerLines, answerText } from "../answer-lines.js";
import { SUBMISSION_STATUSES } from "../types.js";
import {
  useDeleteSubmission,
  useFormDefinitions,
  useSetSubmissionNote,
  useSetSubmissionStatus,
  useSubmission,
  useSubmissionCounts,
  useSubmissions,
} from "./rpc.js";
import { formFilterOptions, submissionColumns } from "./table.js";

// Radix Select forbids an empty-string item value, so "every form"
// carries a sentinel that maps back to no filter at all.
const ANY_FORM = "__any__";

// As many answers as fit beside the date and the status without the
// table scrolling; the rest are in the submission itself.
const MAX_COLUMNS = 3;

const STATUS_LABELS = {
  new: { id: "plugin.forms.status.new", message: "New" },
  read: { id: "plugin.forms.status.read", message: "Read" },
  archived: { id: "plugin.forms.status.archived", message: "Archived" },
  spam: { id: "plugin.forms.status.spam", message: "Spam" },
} satisfies Record<SubmissionStatus, MessageDescriptor>;

// Descriptors read outside JSX — attributes, dynamic lookups, and the
// two words a stored checkbox answer is rendered with.
const M = {
  // The same id the admin page is registered under in `index.ts`: one
  // string, so one translation unit rather than two that can disagree.
  heading: { id: "plugin.forms.adminPage.title", message: "Form submissions" },
  allForms: { id: "plugin.forms.inbox.allForms", message: "All forms" },
  allStatuses: { id: "plugin.forms.inbox.allStatuses", message: "All" },
  notePlaceholder: {
    id: "plugin.forms.inbox.notePlaceholder",
    message: "A note for whoever picks this up next…",
  },
  noteLabel: { id: "plugin.forms.inbox.noteLabel", message: "Private note" },
  openLabel: {
    id: "plugin.forms.inbox.openLabel",
    message: "Open submission {serial}",
    comment: "serial: the submission's per-form number",
  },
  yes: { id: "plugin.forms.answer.yes", message: "Yes" },
  no: { id: "plugin.forms.answer.no", message: "No" },
} satisfies Record<string, MessageDescriptor>;

const NONE = "—";

// The counts come back as parsed JSON, and a form may legitimately be
// called `constructor` or `toString`. A bare index would then hand back
// an inherited function, which React throws on rendering.
function countFor(
  counts: Readonly<Record<string, number>> | undefined,
  key: string,
): number {
  return counts && Object.hasOwn(counts, key) ? (counts[key] ?? 0) : 0;
}

/** The two words a stored checkbox answer reads as, in the admin's own locale. */
function useAnswerWords(): AnswerWords {
  const { i18n } = useLingui();
  return { yes: i18n._(M.yes), no: i18n._(M.no) };
}

export function SubmissionsShell(): ReactNode {
  const { i18n } = useLingui();
  const [filter, setFilter] = useState<SubmissionFilter>({});
  const [openId, setOpenId] = useState<number | null>(null);

  const definitions = useFormDefinitions();
  const counts = useSubmissionCounts(filter);
  const list = useSubmissions(filter);

  const rows = list.data?.pages.flatMap((page) => page.submissions) ?? [];
  const columns = submissionColumns(rows, MAX_COLUMNS);
  const words = useAnswerWords();

  const formOptions = formFilterOptions(
    definitions.data ?? [],
    Object.keys(counts.data?.forms ?? {}),
    filter.form,
  );

  return (
    <div data-testid="forms-submissions-shell" className="flex flex-col gap-4">
      <h1
        data-testid="forms-submissions-heading"
        className="text-2xl font-semibold"
      >
        {i18n._(M.heading)}
      </h1>

      <div
        data-testid="forms-submissions-filters"
        className="flex flex-wrap items-center gap-2"
      >
        <Select
          value={filter.form ?? ANY_FORM}
          onValueChange={(next) => {
            setFilter({
              ...filter,
              form: next === ANY_FORM ? undefined : next,
            });
          }}
        >
          <SelectTrigger className="w-56" data-testid="forms-form-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_FORM} data-testid="forms-form-filter-any">
              {i18n._(M.allForms)}
            </SelectItem>
            {formOptions.map((form) => (
              <SelectItem
                key={form.slug}
                value={form.slug}
                data-testid={`forms-form-filter-${form.slug}`}
              >
                {form.title}{" "}
                <span
                  data-testid={`forms-form-count-${form.slug}`}
                  className="text-muted-foreground"
                >
                  {countFor(counts.data?.forms, form.slug)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div
          data-testid="forms-status-tabs"
          className="flex items-center gap-1"
        >
          <Button
            type="button"
            variant={filter.status === undefined ? "secondary" : "ghost"}
            size="sm"
            data-testid="forms-status-tab-all"
            aria-pressed={filter.status === undefined}
            onClick={() => {
              setFilter({ ...filter, status: undefined });
            }}
          >
            {i18n._(M.allStatuses)}
          </Button>
          {SUBMISSION_STATUSES.map((status) => (
            <Button
              key={status}
              type="button"
              variant={filter.status === status ? "secondary" : "ghost"}
              size="sm"
              data-testid={`forms-status-tab-${status}`}
              aria-pressed={filter.status === status}
              onClick={() => {
                setFilter({ ...filter, status });
              }}
            >
              {i18n._(STATUS_LABELS[status])}{" "}
              <span
                data-testid={`forms-status-count-${status}`}
                className="text-muted-foreground"
              >
                {countFor(counts.data?.statuses, status)}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <div data-testid="forms-submissions-loading" />
      ) : list.error instanceof Error ? (
        <p
          data-testid="forms-submissions-error"
          className="text-destructive text-sm"
        >
          <Trans
            id="plugin.forms.inbox.error"
            message="Failed to load submissions"
          />
        </p>
      ) : rows.length === 0 ? (
        <p
          data-testid="forms-submissions-empty"
          className="text-muted-foreground text-sm"
        >
          <Trans
            id="plugin.forms.inbox.empty"
            message="Nothing has come in yet."
          />
        </p>
      ) : (
        <Table data-testid="forms-submissions-table">
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans
                  id="plugin.forms.inbox.column.received"
                  message="Received"
                />
              </TableHead>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  data-testid={`forms-column-${column.key}`}
                >
                  {column.label}
                </TableHead>
              ))}
              <TableHead>
                <Trans id="plugin.forms.inbox.column.status" message="Status" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                data-testid={`forms-submission-row-${String(row.id)}`}
              >
                <TableCell className="whitespace-nowrap">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid={`forms-open-${String(row.id)}`}
                    aria-label={i18n._(
                      M.openLabel.id,
                      { serial: row.serial },
                      { message: M.openLabel.message },
                    )}
                    onClick={() => {
                      setOpenId(row.id);
                    }}
                  >
                    {formatDate(i18n.locale, new Date(row.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Button>
                </TableCell>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    data-testid={`forms-cell-${String(row.id)}-${column.key}`}
                    className="max-w-64 truncate"
                  >
                    {answerText(
                      row.answers[column.key],
                      row.labels[column.key],
                      words,
                    )}
                  </TableCell>
                ))}
                <TableCell className="whitespace-nowrap">
                  <Badge variant="secondary">
                    {i18n._(STATUS_LABELS[row.status])}
                  </Badge>{" "}
                  {row.handlerError === null ? null : (
                    <Badge
                      variant="destructive"
                      data-testid={`forms-failed-${String(row.id)}`}
                      title={row.handlerError}
                    >
                      <Trans
                        id="plugin.forms.inbox.failedBadge"
                        message="Failed"
                      />
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {list.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="forms-load-more"
          disabled={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
          className="self-start"
        >
          <Trans id="plugin.forms.inbox.loadMore" message="Load more" />
        </Button>
      ) : null}

      {openId === null ? null : (
        <SubmissionDetail
          id={openId}
          onClose={() => {
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

function SubmissionDetail({
  id,
  onClose,
}: {
  readonly id: number;
  readonly onClose: () => void;
}): ReactNode {
  const { i18n } = useLingui();
  const words = useAnswerWords();
  const submission = useSubmission(id);
  const setStatus = useSetSubmissionStatus();
  const setNote = useSetSubmissionNote();
  const remove = useDeleteSubmission();
  const row = submission.data;
  // One line for whichever write failed: three buttons and a save that
  // silently re-enable are indistinguishable from three that worked.
  const failed = setStatus.error ?? setNote.error ?? remove.error;

  if (submission.isLoading) {
    return (
      <aside
        data-testid="forms-detail-loading"
        className="border-border bg-card h-24 rounded-lg border"
      />
    );
  }
  if (!row) {
    return (
      <aside
        data-testid="forms-detail-gone"
        className="border-border bg-card flex items-center justify-between gap-2 rounded-lg border p-4 text-sm"
      >
        <span className="text-destructive">
          <Trans
            id="plugin.forms.inbox.gone"
            message="That submission is no longer there."
          />
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          data-testid="forms-detail-close"
          onClick={onClose}
        >
          <Trans id="plugin.forms.inbox.close" message="Close" />
        </Button>
      </aside>
    );
  }
  return (
    <aside
      data-testid="forms-detail"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 data-testid="forms-detail-title" className="font-semibold">
          {row.form} #{row.serial}
        </h2>
        <div className="flex items-center gap-1">
          {SUBMISSION_STATUSES.filter((status) => status !== row.status).map(
            (status) => (
              <Button
                key={status}
                type="button"
                variant="ghost"
                size="xs"
                data-testid={`forms-detail-status-${status}`}
                disabled={setStatus.isPending}
                onClick={() => {
                  setStatus.mutate({ id: row.id, status });
                }}
                className={
                  status === "spam" ? destructiveGhostClassName : undefined
                }
              >
                {i18n._(STATUS_LABELS[status])}
              </Button>
            ),
          )}
          {/* Archiving and marking spam are both reversible; deleting is
              the one thing on this page that is not, so it asks. */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                data-testid="forms-detail-delete"
                disabled={remove.isPending}
                className={destructiveGhostClassName}
              >
                <Trans id="plugin.forms.inbox.delete" message="Delete" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <Trans
                    id="plugin.forms.inbox.deleteTitle"
                    message="Delete this submission?"
                  />
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <Trans
                    id="plugin.forms.inbox.deleteDescription"
                    message="The answers, the note and everything else on it go for good. Archive it instead to keep it out of the way."
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={remove.isPending}>
                  <Trans id="plugin.forms.inbox.cancel" message="Cancel" />
                </AlertDialogCancel>
                <AlertDialogAction
                  data-testid="forms-detail-delete-confirm"
                  disabled={remove.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    remove.mutate({ id: row.id }, { onSuccess: onClose });
                  }}
                >
                  <Trans id="plugin.forms.inbox.delete" message="Delete" />
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-testid="forms-detail-close"
            onClick={onClose}
          >
            <Trans id="plugin.forms.inbox.close" message="Close" />
          </Button>
        </div>
      </div>

      {failed === null ? null : (
        <p
          data-testid="forms-detail-write-error"
          className="text-destructive text-sm"
        >
          <Trans
            id="plugin.forms.inbox.writeError"
            message="That did not go through:"
          />{" "}
          {failed.message}
        </p>
      )}

      {row.handlerError === null ? null : (
        <p
          data-testid="forms-detail-handler-error"
          className="text-destructive text-sm"
        >
          <Trans
            id="plugin.forms.inbox.handlerError"
            message="What the site meant to do next did not finish:"
          />{" "}
          {row.handlerError}
        </p>
      )}

      {/* Not a `<dl>`: a group or a repeater row is a name with no value
          of its own, and a `<dt>` with no `<dd>` is not a list a reader
          can rely on. The nesting is carried by the indent instead. */}
      <div data-testid="forms-detail-answers" className="flex flex-col gap-1">
        {answerLines(row.answers, row.labels, words).map((line) => (
          <p
            key={line.path}
            data-testid={`forms-answer-${line.path}`}
            className="flex flex-wrap gap-2 text-sm"
            style={{ marginInlineStart: `${String(line.depth)}rem` }}
          >
            <span className="text-muted-foreground">
              {line.row === undefined ? line.label : `${line.label}.`}
            </span>
            {line.text === null ? null : (
              <span className="whitespace-pre-wrap">{line.text}</span>
            )}
          </p>
        ))}
      </div>

      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt>
          <Trans id="plugin.forms.inbox.detail.received" message="Received" />
        </dt>
        <dd data-testid="forms-detail-received">
          {formatDate(i18n.locale, new Date(row.createdAt), {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </dd>
        <dt>
          <Trans id="plugin.forms.inbox.detail.entry" message="Page entry" />
        </dt>
        <dd data-testid="forms-detail-entry">{row.entryId ?? NONE}</dd>
        <dt>
          <Trans id="plugin.forms.inbox.detail.ipHash" message="IP hash" />
        </dt>
        <dd data-testid="forms-detail-ip">{row.ipHash ?? NONE}</dd>
        <dt>
          <Trans
            id="plugin.forms.inbox.detail.userAgent"
            message="User agent"
          />
        </dt>
        <dd data-testid="forms-detail-agent">{row.userAgent ?? NONE}</dd>
      </dl>

      {/* Keyed on the submission, not on its note: opening another one
          remounts the box on that one's note, while a save leaves what is
          in the box alone — typing on while it is in flight would
          otherwise lose whatever was added. */}
      <NoteEditor
        key={row.id}
        note={row.note}
        onSave={(note) => {
          setNote.mutate({ id: row.id, note });
        }}
        saving={setNote.isPending}
      />
    </aside>
  );
}

function NoteEditor({
  note,
  onSave,
  saving,
}: {
  readonly note: string | null;
  readonly onSave: (note: string | null) => void;
  readonly saving: boolean;
}): ReactNode {
  const { i18n } = useLingui();
  const [draft, setDraft] = useState(note ?? "");

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        data-testid="forms-detail-note"
        aria-label={i18n._(M.noteLabel)}
        placeholder={i18n._(M.notePlaceholder)}
        value={draft}
        rows={3}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="forms-detail-note-save"
        disabled={saving}
        onClick={() => {
          onSave(draft.trim() === "" ? null : draft);
        }}
        className="self-start"
      >
        <Trans id="plugin.forms.inbox.saveNote" message="Save note" />
      </Button>
    </div>
  );
}
