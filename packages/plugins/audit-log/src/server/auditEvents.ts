// A test runs `assertRedactionInvariants` over this table, so a row
// auditing a subject with a sensitive field must list that field in
// `diff.omit`.

import type { JsonObject } from "plumix";
import type {
  AppContext,
  EventDefinition,
  PluginSetupContext,
} from "plumix/plugin";
import { auth, entry, settings, term, user } from "plumix/plugin";

import type { NewAuditLogRow } from "../db/schema.js";
import type { AuditEntityRow, AuditLogActor } from "../types.js";
import type { AuditService } from "./auditService.js";
import type { SubjectInput } from "./subjectExtractors.js";
import { buildAuditRow } from "./buildAuditRow.js";
import { extractSubject } from "./subjectExtractors.js";

function actorOf(ctx: AppContext): AuditLogActor {
  if (ctx.user === null) return { id: null, label: null };
  return actorFromUser(ctx.user);
}

function actorFromUser(user: {
  readonly id: number;
  readonly email: string;
}): AuditLogActor {
  return { id: user.id, label: user.email };
}

function stripKeys(
  source: Readonly<AuditEntityRow>,
  omit: readonly string[],
): AuditEntityRow {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (omit.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
// Redaction guard
// ──────────────────────────────────────────────────────────────────

/**
 * Keys every `diff.omit` must include for a row of this subject type, or
 * `user:updated` would leak `passwordHash` into the audit table.
 */
export const SUBJECT_REQUIRED_REDACTIONS: Readonly<
  Record<string, readonly string[]>
> = {
  user: ["passwordHash"],
};

interface RedactedRow {
  readonly event: string;
  readonly subject: { readonly type: string };
  readonly diff?: { readonly omit: readonly string[] };
}

/**
 * Throws, naming the event, when a row's `diff.omit` misses a key `required`
 * lists for its subject type.
 */
export function assertRedactionInvariants(
  events: readonly RedactedRow[],
  required: Readonly<Record<string, readonly string[]>>,
): void {
  for (const def of events) {
    const requiredKeys = required[def.subject.type];
    if (!requiredKeys || requiredKeys.length === 0) continue;
    if (!def.diff) continue;
    const omit = def.diff.omit;
    for (const key of requiredKeys) {
      if (!omit.includes(key)) {
        // eslint-disable-next-line no-restricted-syntax -- dev-time invariant guard surfaced as a test failure, not a runtime exception path
        throw new Error(
          `[audit-log] event "${def.event}" diffs a "${def.subject.type}" subject but does not redact "${key}". Add it to diff.omit.`,
        );
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────
// Declared events
// ──────────────────────────────────────────────────────────────────

/**
 * A row recorded from an event declared as a value. `event` is the name the
 * row stores, which the feed's event filter and existing rows read.
 */
interface AuditedEventDef<TPayload> {
  readonly event: string;
  readonly on: EventDefinition<TPayload>;
  readonly subject:
    | {
        readonly kind: "extract";
        readonly type: string;
        readonly from: (payload: TPayload) => SubjectInput;
      }
    | {
        readonly kind: "inline";
        readonly type: string;
        readonly resolve: (payload: TPayload) => {
          readonly id: string;
          readonly label: string;
        };
      };
  readonly actor: (payload: TPayload, ctx: AppContext) => AuditLogActor;
  readonly diff?: {
    readonly omit: readonly string[];
    readonly between: (payload: TPayload) => {
      readonly previous: AuditEntityRow;
      readonly next: AuditEntityRow;
    };
  };
  /** Merged into the row's `properties`; a `Date` is converted by hand. */
  readonly extra?: (payload: TPayload) => JsonObject;
}

export interface AuditedEvent extends RedactedRow {
  subscribe(ctx: PluginSetupContext, service: AuditService): void;
}

function audited<TPayload>(def: AuditedEventDef<TPayload>): AuditedEvent {
  return {
    event: def.event,
    subject: def.subject,
    diff: def.diff,
    subscribe: (ctx, service) => {
      ctx.events.on(def.on, (payload, appCtx) => {
        service.record(appCtx, buildEventRow(def, payload, appCtx));
      });
    },
  };
}

function buildEventRow<TPayload>(
  def: AuditedEventDef<TPayload>,
  payload: TPayload,
  ctx: AppContext,
): NewAuditLogRow {
  const subject =
    def.subject.kind === "inline"
      ? { type: def.subject.type, ...def.subject.resolve(payload) }
      : extractSubject(def.subject.type, def.subject.from(payload));
  const diffed = def.diff && {
    omit: def.diff.omit,
    ...def.diff.between(payload),
  };
  return buildAuditRow({
    event: def.event,
    actor: def.actor(payload, ctx),
    subject,
    previous: diffed && stripKeys(diffed.previous, diffed.omit),
    next: diffed && stripKeys(diffed.next, diffed.omit),
    extraProperties: def.extra?.(payload),
  });
}

function actorOfPayload({
  actor,
}: {
  readonly actor: { readonly id: number; readonly email: string };
}): AuditLogActor {
  return actorFromUser(actor);
}

/**
 * Sign-in, sign-out and registration run before the request has a user, so
 * the user the payload names is the actor.
 */
function actorIsUser({
  user,
}: {
  readonly user: { readonly id: number; readonly email: string };
}): AuditLogActor {
  return actorFromUser(user);
}

function actorOfCtx(_payload: unknown, ctx: AppContext): AuditLogActor {
  return actorOf(ctx);
}

const entrySubject = {
  kind: "extract",
  type: "entry",
  from: ({ entry }: { readonly entry: SubjectInput }) => entry,
} as const;

const termSubject = {
  kind: "extract",
  type: "term",
  from: ({ term }: { readonly term: SubjectInput }) => term,
} as const;

const userSubject = {
  kind: "extract",
  type: "user",
  from: ({ user }: { readonly user: SubjectInput }) => user,
} as const;

export const auditedEvents: readonly AuditedEvent[] = [
  // ─── Settings surface ───
  audited({
    event: "settings:group_changed",
    on: settings.groupChanged,
    // SECURITY: settings values can carry secrets (SMTP password, API keys), so
    // record only the changed key names.
    subject: {
      kind: "inline",
      type: "settings_group",
      resolve: ({ group }) => ({ id: group, label: group }),
    },
    actor: actorOfCtx,
    extra: ({ set, removed }) => ({
      keysSet: Object.keys(set),
      keysRemoved: removed,
    }),
  }),

  // ─── Entry surface ───
  audited({
    event: "entry:updated",
    on: entry.updated,
    subject: entrySubject,
    actor: actorOfCtx,
    // Auto-managed timestamps would surface as a "diff" on every update;
    // nested JSON (`content` / `meta`) is covered by `entry:meta_changed`
    // so we don't double-count.
    diff: {
      omit: ["createdAt", "updatedAt", "content", "meta"],
      between: ({ entry, previous }) => ({ previous, next: entry }),
    },
  }),
  audited({
    event: "entry:transition",
    on: entry.transition,
    subject: entrySubject,
    actor: actorOfCtx,
    extra: ({ entry, previousStatus }) => ({
      status: { from: previousStatus, to: entry.status },
    }),
  }),
  audited({
    event: "entry:published",
    on: entry.published,
    subject: entrySubject,
    actor: actorOfCtx,
  }),
  audited({
    event: "entry:trashed",
    on: entry.trashed,
    subject: entrySubject,
    actor: actorOfCtx,
  }),
  audited({
    event: "entry:restored",
    on: entry.restored,
    subject: entrySubject,
    actor: actorOfCtx,
  }),
  audited({
    event: "entry:deleted",
    on: entry.deleted,
    subject: entrySubject,
    actor: actorOfCtx,
  }),
  audited({
    event: "entry:meta_changed",
    on: entry.metaChanged,
    subject: {
      kind: "inline",
      type: "entry",
      resolve: ({ entry }) => ({
        id: String(entry.id),
        label: `Entry #${String(entry.id)}`,
      }),
    },
    actor: actorOfCtx,
    extra: ({ changes }) => ({
      metaSet: Object.keys(changes.set),
      metaRemoved: changes.removed,
    }),
  }),

  // ─── Term surface ───
  audited({
    event: "term:created",
    on: term.created,
    subject: termSubject,
    actor: actorOfCtx,
  }),
  audited({
    event: "term:updated",
    on: term.updated,
    subject: termSubject,
    actor: actorOfCtx,
    diff: {
      omit: ["createdAt", "updatedAt", "meta"],
      between: ({ term, previous }) => ({ previous, next: term }),
    },
  }),
  audited({
    event: "term:deleted",
    on: term.deleted,
    subject: termSubject,
    actor: actorOfCtx,
  }),
  audited({
    event: "term:meta_changed",
    on: term.metaChanged,
    subject: {
      kind: "inline",
      type: "term",
      resolve: ({ term }) => ({
        id: String(term.id),
        label: `Term #${String(term.id)}`,
      }),
    },
    actor: actorOfCtx,
    extra: ({ term, changes }) => ({
      taxonomy: term.taxonomy,
      metaSet: Object.keys(changes.set),
      metaRemoved: changes.removed,
    }),
  }),

  // ─── User surface ───
  audited({
    event: "user:updated",
    on: user.updated,
    subject: userSubject,
    actor: actorOfCtx,
    diff: {
      omit: ["createdAt", "updatedAt", "lastSignInAt", "passwordHash", "meta"],
      between: ({ user, previous }) => ({ previous, next: user }),
    },
  }),
  audited({
    event: "user:status_changed",
    on: user.statusChanged,
    subject: userSubject,
    actor: actorOfCtx,
    // The diff renderer already understands `[old, new]` tuples; encode
    // the boolean toggle as one so the feed reads consistently.
    extra: ({ enabled }) => ({
      status: [
        enabled ? "disabled" : "enabled",
        enabled ? "enabled" : "disabled",
      ],
    }),
  }),
  audited({
    event: "user:deleted",
    on: user.deleted,
    subject: userSubject,
    actor: actorOfCtx,
    extra: ({ reassignedTo }) => ({ reassignedTo }),
  }),
  audited({
    event: "user:meta_changed",
    on: user.metaChanged,
    subject: {
      kind: "inline",
      type: "user",
      resolve: ({ user }) => ({
        id: String(user.id),
        label: `User #${String(user.id)}`,
      }),
    },
    actor: actorOfCtx,
    extra: ({ changes }) => ({
      metaSet: Object.keys(changes.set),
      metaRemoved: changes.removed,
    }),
  }),
  audited({
    event: "user:invited",
    on: user.invited,
    subject: userSubject,
    // A CLI-initiated invite has no matching ctx.user, so the label falls back
    // to the id. SECURITY: `inviteToken` is never recorded.
    actor: ({ invitedBy }, ctx) => ({
      id: invitedBy,
      label: ctx.user?.id === invitedBy ? ctx.user.email : String(invitedBy),
    }),
    extra: ({ expiresAt }) => ({ expiresAt: expiresAt.toISOString() }),
  }),
  audited({
    event: "user:registered",
    on: auth.registered,
    subject: userSubject,
    actor: actorIsUser,
  }),

  // ─── Auth surface ───
  audited({
    event: "user:signed_in",
    on: auth.signedIn,
    subject: userSubject,
    actor: actorIsUser,
    extra: ({ method, provider, firstSignIn }) => ({
      method,
      provider: provider ?? null,
      firstSignIn,
    }),
  }),
  audited({
    event: "user:signed_out",
    on: auth.signedOut,
    subject: userSubject,
    actor: actorIsUser,
  }),
  audited({
    event: "user:email_change_requested",
    on: auth.emailChangeRequested,
    subject: userSubject,
    // An admin may request the change for someone else, so the payload's
    // actor, not ctx.user, is the responsible party.
    actor: actorOfPayload,
    extra: ({ newEmail, expiresAt }) => ({
      newEmail,
      expiresAt: expiresAt.toISOString(),
    }),
  }),
  audited({
    event: "user:email_changed",
    on: auth.emailChanged,
    subject: userSubject,
    actor: actorOfCtx,
    extra: ({ user, previousEmail }) => ({
      email: [previousEmail, user.email],
    }),
  }),
  audited({
    event: "credential:created",
    on: auth.credentialCreated,
    subject: {
      kind: "extract",
      type: "credential",
      from: ({ credential }) => credential,
    },
    actor: actorOfPayload,
    extra: ({ credential }) => ({
      deviceType: credential.deviceType,
      isBackedUp: credential.isBackedUp,
      userId: credential.userId,
    }),
  }),
  audited({
    event: "credential:revoked",
    on: auth.credentialRevoked,
    subject: {
      kind: "extract",
      type: "credential",
      from: ({ credential }) => credential,
    },
    actor: actorOfPayload,
    extra: ({ credential }) => ({ userId: credential.userId }),
  }),
  audited({
    event: "credential:renamed",
    on: auth.credentialRenamed,
    subject: {
      kind: "inline",
      type: "credential",
      resolve: ({ credential, name }) => ({ id: credential.id, label: name }),
    },
    actor: actorOfPayload,
    extra: ({ credential }) => ({ userId: credential.userId }),
  }),
  audited({
    event: "session:revoked",
    on: auth.sessionRevoked,
    subject: {
      kind: "extract",
      type: "session",
      from: ({ session }) => session,
    },
    actor: actorOfPayload,
    extra: ({ session, mode }) => ({ mode, userId: session.userId }),
  }),
  audited({
    event: "api_token:created",
    on: auth.apiTokenCreated,
    subject: {
      kind: "extract",
      type: "api_token",
      from: ({ apiToken }) => apiToken,
    },
    actor: actorOfPayload,
    extra: ({ apiToken }) => ({
      prefix: apiToken.prefix,
      scopes: apiToken.scopes,
      userId: apiToken.userId,
      expiresAt: apiToken.expiresAt ? apiToken.expiresAt.toISOString() : null,
    }),
  }),
  audited({
    event: "api_token:revoked",
    on: auth.apiTokenRevoked,
    subject: {
      kind: "extract",
      type: "api_token",
      from: ({ apiToken }) => apiToken,
    },
    actor: actorOfPayload,
    extra: ({ apiToken, mode }) => ({ mode, userId: apiToken.userId }),
  }),
  audited({
    event: "device_code:approved",
    on: auth.deviceCodeApproved,
    // A device-code session's user-facing handle is its `userCode`
    // (`ABCD-WXYZ`), which the device_code extractor reads as `title`.
    subject: {
      kind: "extract",
      type: "device_code",
      from: ({ deviceCode }) => ({
        id: deviceCode.id,
        title: deviceCode.userCode,
      }),
    },
    actor: actorOfPayload,
    extra: ({ deviceCode }) => ({
      tokenName: deviceCode.tokenName,
      scopes: deviceCode.scopes,
    }),
  }),
  audited({
    event: "device_code:denied",
    on: auth.deviceCodeDenied,
    subject: {
      kind: "extract",
      type: "device_code",
      from: ({ deviceCode }) => ({
        id: deviceCode.id,
        title: deviceCode.userCode,
      }),
    },
    actor: actorOfPayload,
  }),
];

// ──────────────────────────────────────────────────────────────────
// Interpreter
// ──────────────────────────────────────────────────────────────────

/**
 * Subscribe one handler per row of `auditedEvents`, routing a built row
 * through `service.record`.
 */
export function registerAuditEvents(
  ctx: PluginSetupContext,
  service: AuditService,
): void {
  for (const def of auditedEvents) def.subscribe(ctx, service);
}
