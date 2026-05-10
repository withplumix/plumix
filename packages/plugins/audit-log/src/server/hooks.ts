// Hook subscriptions that capture lifecycle events into the audit log.
// Each listener pulls the per-request `AppContext` out of
// `requestStore.getStore()` (provided by the runtime via #176/#177)
// so it can call `service.record(ctx, row)` against the buffered
// per-request batch.
//
// Slice 178 wired the entry surface; #179 (this file's expansion)
// adds user / auth / term / settings — the full curated list per the
// audit-log PRD. Each thematic register* function is independent;
// definePlugin's `setup` wires them all in one place.

import type {
  ApiToken,
  AppContext,
  AuthenticatedUser,
  Credential,
  Entry,
  EntryStatus,
  PluginSetupContext,
  Term,
  User,
} from "@plumix/core";
import { tryGetContext } from "@plumix/core";

import type { NewAuditLogRow } from "../db/schema.js";
import type { AuditLogActor } from "../types.js";
import type { AuditService } from "./auditService.js";
import type { EntryMetaChanges } from "./entry-meta-changes.js";
import { buildAuditRow } from "./buildAuditRow.js";
import { extractSubject } from "./subjectExtractors.js";

// Diff-stripping omit list per subject type. Auto-managed timestamps
// would otherwise show as a "diff" on every update; nested JSON
// (content / meta / settings.values) is covered by dedicated
// `*:meta_changed` and `settings:group_changed` hooks so we don't
// double-count.
const ENTRY_DIFF_OMIT_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "content",
  "meta",
]);

const USER_DIFF_OMIT_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "lastSignInAt",
  "passwordHash",
  "meta",
]);

const TERM_DIFF_OMIT_KEYS = new Set(["createdAt", "updatedAt", "meta"]);

export function registerHooks(
  ctx: PluginSetupContext,
  service: AuditService,
): void {
  registerEntryHooks(ctx, service);
  registerUserHooks(ctx, service);
  registerAuthHooks(ctx, service);
  registerTermHooks(ctx, service);
  registerSettingsHooks(ctx, service);
}

// Internal helper: resolve the request ctx + actor, build the row,
// and route through the buffered service. Returning early on a missing
// ctx surfaces a one-time DX warn (see auditService.warnNoContextOnce)
// without spamming the log per event.
function record(
  service: AuditService,
  buildFromCtx: (ctx: AppContext, actor: AuditLogActor) => NewAuditLogRow,
): void {
  const appCtx = tryGetContext();
  if (!appCtx) {
    service.warnNoContextOnce();
    return;
  }
  service.record(appCtx, buildFromCtx(appCtx, actorOf(appCtx)));
}

// ──────────────────────────────────────────────────────────────────
// Entry surface (carried over from slice 178)
// ──────────────────────────────────────────────────────────────────

function registerEntryHooks(
  ctx: PluginSetupContext,
  service: AuditService,
): void {
  ctx.addAction("entry:updated", (entry: Entry, previous: Entry) => {
    record(service, (_appCtx, actor) =>
      buildAuditRow({
        event: "entry:updated",
        actor,
        subject: extractSubject("entry", entry),
        previous: stripKeys(previous, ENTRY_DIFF_OMIT_KEYS),
        next: stripKeys(entry, ENTRY_DIFF_OMIT_KEYS),
      }),
    );
  });

  ctx.addAction("entry:transition", (entry: Entry, oldStatus: EntryStatus) => {
    record(service, (_appCtx, actor) =>
      buildAuditRow({
        event: "entry:transition",
        actor,
        subject: extractSubject("entry", entry),
        extraProperties: { status: { from: oldStatus, to: entry.status } },
      }),
    );
  });

  ctx.addAction("entry:published", (entry: Entry) => {
    record(service, (_appCtx, actor) =>
      buildAuditRow({
        event: "entry:published",
        actor,
        subject: extractSubject("entry", entry),
      }),
    );
  });

  ctx.addAction("entry:trashed", (entry: Entry) => {
    record(service, (_appCtx, actor) =>
      buildAuditRow({
        event: "entry:trashed",
        actor,
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
      record(service, (_appCtx, actor) =>
        buildAuditRow({
          event: "entry:meta_changed",
          actor,
          subject: {
            type: "entry",
            id: String(entry.id),
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

// ──────────────────────────────────────────────────────────────────
// User surface
// ──────────────────────────────────────────────────────────────────

function registerUserHooks(
  ctx: PluginSetupContext,
  service: AuditService,
): void {
  ctx.addAction("user:updated", (user: User, previous: User) => {
    record(service, (_appCtx, actor) =>
      buildAuditRow({
        event: "user:updated",
        actor,
        subject: extractSubject("user", user),
        previous: stripKeys(previous, USER_DIFF_OMIT_KEYS),
        next: stripKeys(user, USER_DIFF_OMIT_KEYS),
      }),
    );
  });

  ctx.addAction(
    "user:status_changed",
    (user: User, context: { readonly enabled: boolean }) => {
      record(service, (_appCtx, actor) =>
        buildAuditRow({
          event: "user:status_changed",
          actor,
          subject: extractSubject("user", user),
          // Per the slice acceptance: render as `{ status: [old, new] }`
          // even though the underlying signal is a boolean — the feed's
          // diff renderer already understands the [old, new] tuple.
          extraProperties: {
            status: [
              context.enabled ? "disabled" : "enabled",
              context.enabled ? "enabled" : "disabled",
            ],
          },
        }),
      );
    },
  );

  ctx.addAction(
    "user:deleted",
    (user: User, context: { readonly reassignedTo: number | null }) => {
      record(service, (_appCtx, actor) =>
        buildAuditRow({
          event: "user:deleted",
          actor,
          subject: extractSubject("user", user),
          extraProperties: { reassignedTo: context.reassignedTo },
        }),
      );
    },
  );

  ctx.addAction(
    "user:meta_changed",
    (user: { readonly id: number }, changes: EntryMetaChanges) => {
      record(service, (_appCtx, actor) =>
        buildAuditRow({
          event: "user:meta_changed",
          actor,
          subject: {
            type: "user",
            id: String(user.id),
            label: `User #${String(user.id)}`,
          },
          extraProperties: {
            metaSet: Object.keys(changes.set),
            metaRemoved: changes.removed,
          },
        }),
      );
    },
  );

  ctx.addAction(
    "user:invited",
    (
      user: User,
      context: {
        readonly invitedBy: number;
        readonly expiresAt: Date;
      },
    ) => {
      record(service, (appCtx) => {
        // The hook explicitly carries `invitedBy` — the admin who
        // initiated the invite. When the admin is also the request's
        // ctx.user, prefer their email as the label so the feed reads
        // consistently with their other actions; otherwise (e.g. a
        // CLI-initiated invite) fall back to the id-as-string.
        // SECURITY: `inviteToken` is never recorded.
        const label =
          appCtx.user?.id === context.invitedBy
            ? appCtx.user.email
            : String(context.invitedBy);
        return buildAuditRow({
          event: "user:invited",
          actor: { id: context.invitedBy, label },
          subject: extractSubject("user", user),
          extraProperties: {
            expiresAt: context.expiresAt.toISOString(),
          },
        });
      });
    },
  );

  ctx.addAction("user:registered", (user: User) => {
    record(service, () =>
      buildAuditRow({
        event: "user:registered",
        // Self-registration: the user who just registered IS the actor.
        // `ctx.user` is null at this point because the session is being
        // established in the same request, so fall back to the payload.
        actor: actorFromUser(user),
        subject: extractSubject("user", user),
      }),
    );
  });
}

// ──────────────────────────────────────────────────────────────────
// Auth surface — sign-ins, credentials, sessions, API tokens, device flow
// ──────────────────────────────────────────────────────────────────

function registerAuthHooks(
  ctx: PluginSetupContext,
  service: AuditService,
): void {
  ctx.addAction(
    "user:signed_in",
    (
      user: User,
      context: {
        readonly method: string;
        readonly provider?: string;
        readonly firstSignIn: boolean;
      },
    ) => {
      record(service, () =>
        buildAuditRow({
          event: "user:signed_in",
          // Self sign-in: `ctx.user` is null on the request that just
          // authenticated (middleware ran before auth completed), so
          // attribute the row to the user being signed in directly.
          actor: actorFromUser(user),
          subject: extractSubject("user", user),
          extraProperties: {
            method: context.method,
            provider: context.provider ?? null,
            firstSignIn: context.firstSignIn,
          },
        }),
      );
    },
  );

  ctx.addAction("user:signed_out", (user: User) => {
    record(service, () =>
      buildAuditRow({
        event: "user:signed_out",
        // Self sign-out: same self-attribution as signed_in for symmetry.
        actor: actorFromUser(user),
        subject: extractSubject("user", user),
      }),
    );
  });

  ctx.addAction(
    "user:email_change_requested",
    (
      user: User,
      context: {
        readonly actor: AuthenticatedUser;
        readonly newEmail: string;
        readonly expiresAt: Date;
      },
    ) => {
      record(service, () =>
        buildAuditRow({
          event: "user:email_change_requested",
          // The hook explicitly carries `context.actor` (which may
          // differ from `user` when an admin requests the change for
          // someone else). Prefer the explicit actor over ctx.user
          // so the row reflects the responsible party.
          actor: actorFromUser(context.actor),
          subject: extractSubject("user", user),
          extraProperties: {
            newEmail: context.newEmail,
            expiresAt: context.expiresAt.toISOString(),
          },
        }),
      );
    },
  );

  ctx.addAction(
    "user:email_changed",
    (user: User, context: { readonly previousEmail: string }) => {
      record(service, (_appCtx, actor) =>
        buildAuditRow({
          event: "user:email_changed",
          actor,
          subject: extractSubject("user", user),
          extraProperties: {
            email: [context.previousEmail, user.email],
          },
        }),
      );
    },
  );

  ctx.addAction(
    "credential:created",
    (
      credential: Pick<
        Credential,
        "id" | "userId" | "name" | "deviceType" | "isBackedUp"
      >,
      context: { readonly actor: AuthenticatedUser },
    ) => {
      record(service, () =>
        buildAuditRow({
          event: "credential:created",
          actor: actorFromUser(context.actor),
          subject: extractSubject("credential", credential),
          extraProperties: {
            deviceType: credential.deviceType,
            isBackedUp: credential.isBackedUp,
            userId: credential.userId,
          },
        }),
      );
    },
  );

  ctx.addAction(
    "credential:revoked",
    (
      credential: { readonly id: string; readonly userId: number },
      context: { readonly actor: AuthenticatedUser },
    ) => {
      record(service, () =>
        buildAuditRow({
          event: "credential:revoked",
          actor: actorFromUser(context.actor),
          subject: extractSubject("credential", credential),
          extraProperties: { userId: credential.userId },
        }),
      );
    },
  );

  ctx.addAction(
    "credential:renamed",
    (
      credential: { readonly id: string; readonly userId: number },
      context: { readonly actor: AuthenticatedUser; readonly name: string },
    ) => {
      record(service, () =>
        buildAuditRow({
          event: "credential:renamed",
          actor: actorFromUser(context.actor),
          subject: {
            type: "credential",
            id: String(credential.id),
            label: context.name,
          },
          extraProperties: { userId: credential.userId },
        }),
      );
    },
  );

  ctx.addAction(
    "session:revoked",
    (
      session: { readonly id: string; readonly userId: number },
      context: {
        readonly actor: AuthenticatedUser;
        readonly mode: "single" | "all_others";
      },
    ) => {
      record(service, () =>
        buildAuditRow({
          event: "session:revoked",
          actor: actorFromUser(context.actor),
          subject: extractSubject("session", session),
          extraProperties: { mode: context.mode, userId: session.userId },
        }),
      );
    },
  );

  ctx.addAction(
    "api_token:created",
    (
      token: Pick<
        ApiToken,
        "id" | "userId" | "name" | "prefix" | "scopes" | "expiresAt"
      >,
      context: { readonly actor: AuthenticatedUser },
    ) => {
      record(service, () =>
        buildAuditRow({
          event: "api_token:created",
          actor: actorFromUser(context.actor),
          subject: extractSubject("api_token", token),
          extraProperties: {
            prefix: token.prefix,
            scopes: token.scopes,
            userId: token.userId,
            expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
          },
        }),
      );
    },
  );

  ctx.addAction(
    "api_token:revoked",
    (
      token: { readonly id: string; readonly userId: number },
      context: {
        readonly actor: AuthenticatedUser;
        readonly mode: "self" | "admin";
      },
    ) => {
      record(service, () =>
        buildAuditRow({
          event: "api_token:revoked",
          actor: actorFromUser(context.actor),
          subject: extractSubject("api_token", token),
          extraProperties: { mode: context.mode, userId: token.userId },
        }),
      );
    },
  );

  ctx.addAction(
    "device_code:approved",
    (
      deviceCode: {
        readonly id: string;
        readonly userCode: string;
        readonly tokenName: string;
        readonly scopes: readonly string[] | null;
      },
      context: { readonly actor: AuthenticatedUser },
    ) => {
      record(service, () =>
        buildAuditRow({
          event: "device_code:approved",
          actor: actorFromUser(context.actor),
          // The user-facing handle for a device-code session is the
          // `userCode` (e.g. `ABCD-WXYZ`). Map it through the
          // extractor by feeding it as `title` — that's what the
          // device_code extractor reads.
          subject: extractSubject("device_code", {
            id: deviceCode.id,
            title: deviceCode.userCode,
          }),
          extraProperties: {
            tokenName: deviceCode.tokenName,
            scopes: deviceCode.scopes,
          },
        }),
      );
    },
  );

  ctx.addAction(
    "device_code:denied",
    (
      deviceCode: { readonly id: string; readonly userCode: string },
      context: { readonly actor: AuthenticatedUser },
    ) => {
      record(service, () =>
        buildAuditRow({
          event: "device_code:denied",
          actor: actorFromUser(context.actor),
          subject: extractSubject("device_code", {
            id: deviceCode.id,
            title: deviceCode.userCode,
          }),
        }),
      );
    },
  );
}

// ──────────────────────────────────────────────────────────────────
// Term surface
// ──────────────────────────────────────────────────────────────────

function registerTermHooks(
  ctx: PluginSetupContext,
  service: AuditService,
): void {
  ctx.addAction("term:created", (term: Term) => {
    record(service, (_appCtx, actor) =>
      buildAuditRow({
        event: "term:created",
        actor,
        subject: extractSubject("term", term),
      }),
    );
  });

  ctx.addAction("term:updated", (term: Term, previous: Term) => {
    record(service, (_appCtx, actor) =>
      buildAuditRow({
        event: "term:updated",
        actor,
        subject: extractSubject("term", term),
        previous: stripKeys(previous, TERM_DIFF_OMIT_KEYS),
        next: stripKeys(term, TERM_DIFF_OMIT_KEYS),
      }),
    );
  });

  ctx.addAction("term:deleted", (term: Term) => {
    record(service, (_appCtx, actor) =>
      buildAuditRow({
        event: "term:deleted",
        actor,
        subject: extractSubject("term", term),
      }),
    );
  });

  ctx.addAction(
    "term:meta_changed",
    (
      term: { readonly id: number; readonly taxonomy: string },
      changes: EntryMetaChanges,
    ) => {
      record(service, (_appCtx, actor) =>
        buildAuditRow({
          event: "term:meta_changed",
          actor,
          subject: {
            type: "term",
            id: String(term.id),
            label: `Term #${String(term.id)}`,
          },
          extraProperties: {
            taxonomy: term.taxonomy,
            metaSet: Object.keys(changes.set),
            metaRemoved: changes.removed,
          },
        }),
      );
    },
  );
}

// ──────────────────────────────────────────────────────────────────
// Settings surface
// ──────────────────────────────────────────────────────────────────

function registerSettingsHooks(
  ctx: PluginSetupContext,
  service: AuditService,
): void {
  ctx.addAction(
    "settings:group_changed",
    (changes: {
      readonly group: string;
      readonly set: Readonly<Record<string, unknown>>;
      readonly removed: readonly string[];
    }) => {
      record(service, (_appCtx, actor) =>
        // SECURITY: settings values can carry secrets (SMTP password,
        // OAuth client secret, API keys). Record only the changed key
        // names — never the values — so the audit table doesn't become
        // a credential mirror. Consumers that need values should read
        // them through the settings API with proper redaction in v0.2.
        buildAuditRow({
          event: "settings:group_changed",
          actor,
          subject: {
            type: "settings_group",
            id: changes.group,
            label: changes.group,
          },
          extraProperties: {
            keysSet: Object.keys(changes.set),
            keysRemoved: changes.removed,
          },
        }),
      );
    },
  );
}

function actorOf(ctx: AppContext): AuditLogActor {
  if (ctx.user === null) {
    return { id: null, label: null };
  }
  return actorFromUser(ctx.user);
}

function actorFromUser(user: {
  readonly id: number;
  readonly email: string;
}): AuditLogActor {
  return { id: user.id, label: user.email };
}

function stripKeys<T extends Record<string, unknown>>(
  source: T,
  omit: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (omit.has(key)) continue;
    out[key] = value;
  }
  return out;
}
