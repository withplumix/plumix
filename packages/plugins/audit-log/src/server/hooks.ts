// Hook subscriptions that capture entry events into the audit log.
// Each listener pulls the per-request `AppContext` out of
// `requestStore.getStore()` (provided by the runtime via #176/#177)
// so it can call `service.record(ctx, row)` against the buffered
// per-request batch.

import type { Entry, EntryStatus, PluginSetupContext } from "@plumix/core";
import { tryGetContext } from "@plumix/core";

import type { AuditService } from "./auditService.js";
import type { EntryMetaChanges } from "./entry-meta-changes.js";
import { buildAuditRow } from "./buildAuditRow.js";
import { extractSubject } from "./subjectExtractors.js";

interface EntryActorLookup {
  readonly id: number | null;
  readonly label: string | null;
}

export function registerEntryHooks(
  ctx: PluginSetupContext,
  service: AuditService,
): void {
  ctx.addAction("entry:updated", (entry: Entry, previous: Entry) => {
    const appCtx = tryGetContext();
    if (!appCtx) {
      service.warnNoContextOnce();
      return;
    }
    const subject = extractSubject("entry", entry);
    service.record(
      appCtx,
      buildAuditRow({
        event: "entry:updated",
        actor: actorOf(appCtx),
        subject,
        previous: stripDiffNoise(previous),
        next: stripDiffNoise(entry),
      }),
    );
  });

  ctx.addAction("entry:transition", (entry: Entry, oldStatus: EntryStatus) => {
    const appCtx = tryGetContext();
    if (!appCtx) {
      service.warnNoContextOnce();
      return;
    }
    service.record(
      appCtx,
      buildAuditRow({
        event: "entry:transition",
        actor: actorOf(appCtx),
        subject: extractSubject("entry", entry),
        extraProperties: {
          status: { from: oldStatus, to: entry.status },
        },
      }),
    );
  });

  ctx.addAction("entry:published", (entry: Entry) => {
    const appCtx = tryGetContext();
    if (!appCtx) {
      service.warnNoContextOnce();
      return;
    }
    service.record(
      appCtx,
      buildAuditRow({
        event: "entry:published",
        actor: actorOf(appCtx),
        subject: extractSubject("entry", entry),
      }),
    );
  });

  ctx.addAction("entry:trashed", (entry: Entry) => {
    const appCtx = tryGetContext();
    if (!appCtx) {
      service.warnNoContextOnce();
      return;
    }
    service.record(
      appCtx,
      buildAuditRow({
        event: "entry:trashed",
        actor: actorOf(appCtx),
        subject: extractSubject("entry", entry),
      }),
    );
  });

  ctx.addAction(
    "entry:meta_changed",
    (
      entry: { readonly id: number; readonly type: string },
      changes: EntryMetaChanges,
    ) => {
      const appCtx = tryGetContext();
      if (!appCtx) return;
      service.record(
        appCtx,
        buildAuditRow({
          event: "entry:meta_changed",
          actor: actorOf(appCtx),
          subject: {
            type: "entry",
            id: String(entry.id),
            // Meta-changed payload doesn't carry the title — fall back
            // to the entry id as the label. The feed renders this as
            // a numeric breadcrumb; consumers wanting a richer label
            // can resolve at render time.
            label: `Entry #${String(entry.id)}`,
          },
          extraProperties: {
            metaSet: Object.keys(changes.set),
            metaRemoved: changes.removed,
          },
        }),
      );
    },
  );
}

function actorOf(ctx: {
  readonly user: { readonly id: number; readonly email: string } | null;
}): EntryActorLookup {
  if (ctx.user === null) {
    return { id: null, label: null };
  }
  return { id: ctx.user.id, label: ctx.user.email };
}

const DIFF_OMIT_KEYS = new Set([
  // Auto-managed timestamps would always show as a "diff" on every
  // update. Skip them so the diff envelope only carries fields the
  // user actually changed.
  "createdAt",
  "updatedAt",
  // Nested JSON; covered by the dedicated `entry:meta_changed` hook.
  "content",
  "meta",
]);

function stripDiffNoise(entry: Entry): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (DIFF_OMIT_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}
