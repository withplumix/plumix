import type { ReactNode } from "react";

import type { AuditLogRowDTO } from "./rpc.js";
import { useAuditLogList } from "./rpc.js";

const MAX_DIFF_PREVIEW_FIELDS = 3;

export function AuditLogShell(): ReactNode {
  const list = useAuditLogList();

  if (list.isLoading) {
    return <div data-testid="audit-log-loading" />;
  }

  if (list.error instanceof Error) {
    return (
      <div data-testid="audit-log-error">
        Failed to load audit log: {list.error.message}
      </div>
    );
  }

  const rows = list.data?.rows ?? [];

  return (
    <div data-testid="audit-log-shell">
      <h1>Audit log</h1>
      {rows.length === 0 ? (
        <p data-testid="audit-log-empty">No audit events yet.</p>
      ) : (
        <table data-testid="audit-log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Event</th>
              <th>Subject</th>
              <th>Changes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <AuditLogRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AuditLogRow({ row }: { readonly row: AuditLogRowDTO }): ReactNode {
  return (
    <tr data-testid={`audit-log-row-${String(row.id)}`}>
      <td>{formatTimestamp(row.occurredAt)}</td>
      <td>{row.actorLabel ?? "(system)"}</td>
      <td data-testid={`audit-log-event-${String(row.id)}`}>{row.event}</td>
      <td data-testid={`audit-log-subject-${String(row.id)}`}>
        {row.subjectLabel}
      </td>
      <td>
        <DiffPreview properties={row.properties} />
      </td>
    </tr>
  );
}

function DiffPreview({
  properties,
}: {
  readonly properties: Record<string, unknown>;
}): ReactNode {
  const diff = properties.diff;
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return null;
  const fields = Object.keys(diff);
  if (fields.length === 0) return null;
  const preview = fields.slice(0, MAX_DIFF_PREVIEW_FIELDS).join(", ");
  const overflow = fields.length - MAX_DIFF_PREVIEW_FIELDS;
  return (
    <span data-testid="audit-log-diff-preview">
      {preview}
      {overflow > 0 ? ` +${String(overflow)} more` : null}
    </span>
  );
}

function formatTimestamp(iso: string): string {
  // Inputs land here as ISO strings via the RPC's JSON encoder; keep
  // formatting minimal for v1 — operators with locale needs can swap
  // in their own component when slice #180's filters land.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "Z");
}
