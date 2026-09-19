import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { hasCap } from "@/lib/caps.js";
import {
  findEntryTypeByName,
  findSettingsGroupByName,
  findTermTaxonomyByName,
} from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import type { Label } from "@plumix/core/i18n";
import { Alert, AlertDescription } from "@plumix/admin-ui/alert";
import { Button } from "@plumix/admin-ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plumix/admin-ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@plumix/admin-ui/table";

type Sweep = Awaited<ReturnType<typeof orpc.meta.sweep.call>>;
type SweepKey = Sweep["keys"][number];
type SweepCursor = NonNullable<Sweep["next"]>;

// Matches the server's cap on the rows it names per field.
const MAX_LINKED_ROWS = 20;

const STORE_LABELS = {
  entry: defineMessage({ id: "fieldValues.store.entry", message: "Entries" }),
  term: defineMessage({ id: "fieldValues.store.term", message: "Terms" }),
  user: defineMessage({ id: "fieldValues.store.user", message: "Users" }),
  settings: defineMessage({
    id: "fieldValues.store.settings",
    message: "Settings",
  }),
} satisfies Record<SweepKey["store"], MessageDescriptor>;

const M = {
  noScope: defineMessage({
    id: "fieldValues.scope.none",
    message: "—",
    comment: "Shown in the type column for users, whose fields have no type",
  }),
} satisfies Record<string, MessageDescriptor>;

export const Route = createFileRoute("/_authenticated/field-values/")({
  beforeLoad: ({ context }) => {
    if (!hasCap(context.user.capabilities, "settings:manage")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  component: FieldValuesRoute,
});

// The server stops each call at a query budget — D1 caps what one request may
// do — and hands back where it stopped, so a whole site is walked a call at a
// time and the calls' counts are added up here.
async function readReport(): Promise<readonly SweepKey[]> {
  let keys: readonly SweepKey[] = [];
  let cursor: SweepCursor | null = null;
  do {
    const call: Sweep = await orpc.meta.sweep.call({ write: false, cursor });
    keys = mergeKeys(keys, call.keys);
    cursor = call.next;
  } while (cursor !== null);
  return keys;
}

function mergeKeys(
  a: readonly SweepKey[],
  b: readonly SweepKey[],
): readonly SweepKey[] {
  const byKey = new Map<string, SweepKey>();
  for (const count of [...a, ...b]) {
    const id = `${count.store}:${count.scope ?? ""}:${count.key}`;
    const current = byKey.get(id);
    byKey.set(
      id,
      current === undefined
        ? count
        : {
            ...current,
            settleable: current.settleable + count.settleable,
            unconvertible: current.unconvertible + count.unconvertible,
            // The server caps each call's list; the whole report keeps the
            // same cap, so one cell never grows a link per call.
            unconvertibleIds: [
              ...current.unconvertibleIds,
              ...count.unconvertibleIds,
            ].slice(0, MAX_LINKED_ROWS),
          },
    );
  }
  return [...byKey.values()];
}

function FieldValuesRoute(): ReactNode {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const report = useQuery({
    queryKey: orpc.meta.sweep.key(),
    queryFn: readReport,
  });
  const settle = useMutation({
    mutationFn: async () => {
      let settled = 0;
      let cursor: SweepCursor | null = null;
      setProgress(0);
      do {
        const call: Sweep = await orpc.meta.sweep.call({ write: true, cursor });
        settled += call.settled;
        setProgress(settled);
        cursor = call.next;
      } while (cursor !== null);
      return settled;
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: orpc.meta.sweep.key() }),
  });

  const keys = report.data ?? [];
  const settleable = keys.reduce((sum, key) => sum + key.settleable, 0);
  const unconvertible = keys.reduce((sum, key) => sum + key.unconvertible, 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1
          className="text-2xl font-semibold"
          data-testid="field-values-heading"
        >
          <Trans id="fieldValues.title" message="Field values" />
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans
            id="fieldValues.description"
            message="Finds stored field values that aren't in the form their field declares — left by an import, a direct database write, or a plugin that changed a field's type — and converts them. Opening an entry, term or user converts its own values; this does the whole site at once."
          />
        </p>
      </header>

      {settle.isSuccess ? (
        <Alert data-testid="field-values-settled">
          <AlertDescription>
            <Trans
              id="fieldValues.settled"
              message="{count, plural, one {Converted values in # row.} other {Converted values in # rows.}}"
              values={{ count: settle.data }}
            />
          </AlertDescription>
        </Alert>
      ) : null}
      {settle.isError ? (
        <Alert variant="destructive" data-testid="field-values-error">
          <AlertDescription>
            <Trans
              id="fieldValues.error"
              message="{count, plural, one {Stopped after converting values in # row. What was converted stays converted; try again to carry on.} other {Stopped after converting values in # rows. What was converted stays converted; try again to carry on.}}"
              values={{ count: progress }}
            />
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans id="fieldValues.report.title" message="Unconverted values" />
          </CardTitle>
          <CardDescription>
            <Trans
              id="fieldValues.report.description"
              message="Values the site can convert, and values no field type accepts. Those are left exactly as they are; open the listed items to fix them by hand."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ReportBody
            keys={keys}
            isPending={report.isPending}
            isError={report.isError}
          />

          {unconvertible > 0 ? (
            <p className="text-muted-foreground text-sm">
              <Trans
                id="fieldValues.unconvertible"
                message="{count, plural, one {# value no field type accepts is left as stored.} other {# values no field type accepts are left as stored.}}"
                values={{ count: unconvertible }}
              />
            </p>
          ) : null}

          {settleable > 0 ? (
            <div className="flex justify-end">
              <Button
                disabled={settle.isPending}
                onClick={() => {
                  settle.mutate();
                }}
                data-testid="field-values-settle"
              >
                {settle.isPending ? (
                  <Trans
                    id="fieldValues.settle.pending"
                    message="{count, plural, one {Converting… # row so far} other {Converting… # rows so far}}"
                    values={{ count: progress }}
                  />
                ) : (
                  <Trans
                    id="fieldValues.settle.idle"
                    message="Convert values"
                  />
                )}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportBody({
  keys,
  isPending,
  isError,
}: {
  readonly keys: readonly SweepKey[];
  readonly isPending: boolean;
  readonly isError: boolean;
}): ReactNode {
  if (isPending) {
    return (
      <p data-testid="field-values-loading">
        <Trans id="fieldValues.loading" message="Checking stored values…" />
      </p>
    );
  }
  // Checked before the empty case: a report that never ran is not a clean site.
  if (isError) {
    return (
      <Alert variant="destructive" data-testid="field-values-report-error">
        <AlertDescription>
          <Trans
            id="fieldValues.reportError"
            message="The stored values could not be checked. Reload the page to try again."
          />
        </AlertDescription>
      </Alert>
    );
  }
  if (keys.length === 0) {
    return (
      <p data-testid="field-values-clean">
        <Trans
          id="fieldValues.clean"
          message="Every stored value is in the form its field declares."
        />
      </p>
    );
  }
  return (
    <Table data-testid="field-values-report">
      <TableHeader>
        <TableRow>
          <TableHead>
            <Trans id="fieldValues.column.store" message="Stored on" />
          </TableHead>
          <TableHead>
            <Trans id="fieldValues.column.scope" message="Type" />
          </TableHead>
          <TableHead>
            <Trans id="fieldValues.column.key" message="Field" />
          </TableHead>
          <TableHead className="text-end">
            <Trans id="fieldValues.column.settleable" message="Convertible" />
          </TableHead>
          <TableHead className="text-end">
            <Trans id="fieldValues.column.unconvertible" message="Needs you" />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <ReportRow
            key={`${key.store}:${key.scope ?? ""}:${key.key}`}
            count={key}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function ReportRow({ count }: { readonly count: SweepKey }): ReactNode {
  const label = useLabel();
  const { formatNumber } = useFormatters();
  const scope = scopeLabel(count);
  return (
    <TableRow data-testid={`field-values-row-${count.store}-${count.key}`}>
      <TableCell>{label(STORE_LABELS[count.store])}</TableCell>
      <TableCell>
        {scope === undefined ? label(M.noScope) : label(scope)}
      </TableCell>
      <TableCell className="font-mono">{count.key}</TableCell>
      <TableCell className="text-end">
        {formatNumber(count.settleable)}
      </TableCell>
      <TableCell className="text-end">
        <span>{formatNumber(count.unconvertible)}</span>
        {count.unconvertibleIds.length > 0 ? (
          <span className="ms-2 inline-flex flex-wrap gap-1">
            {count.unconvertibleIds.map((id) => (
              <RowLink key={id} count={count} id={id} />
            ))}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

// The declared label when the plugin that declared the scope is installed;
// the raw name otherwise, which is still what the stored rows are keyed by.
function scopeLabel(count: SweepKey): Label | undefined {
  if (count.scope === null) return undefined;
  switch (count.store) {
    case "entry":
      return findEntryTypeByName(count.scope)?.label ?? count.scope;
    case "term":
      return findTermTaxonomyByName(count.scope)?.label ?? count.scope;
    case "settings":
      return findSettingsGroupByName(count.scope)?.label ?? count.scope;
    case "user":
      return undefined;
  }
}

// Where an author fixes the value by hand. Settings rows carry no id, so they
// never reach here.
function RowLink({
  count,
  id,
}: {
  readonly count: SweepKey;
  readonly id: number;
}): ReactNode {
  const testId = `field-values-link-${count.store}-${String(id)}`;
  const text = `#${String(id)}`;
  if (count.store === "user") {
    return (
      <Link to="/users/$id/edit" params={{ id }} data-testid={testId}>
        {text}
      </Link>
    );
  }
  if (count.store === "term" && count.scope !== null) {
    return (
      <Link
        to="/terms/$name/$id/edit"
        params={{ name: count.scope, id }}
        data-testid={testId}
      >
        {text}
      </Link>
    );
  }
  const slug =
    count.store === "entry" && count.scope !== null
      ? findEntryTypeByName(count.scope)?.adminSlug
      : undefined;
  if (slug === undefined) return <span>{text}</span>;
  return (
    <Link
      to="/entries/$slug/$id/edit"
      params={{ slug, id }}
      data-testid={testId}
    >
      {text}
    </Link>
  );
}
