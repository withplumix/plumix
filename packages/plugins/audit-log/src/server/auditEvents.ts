// Declarative source of truth for what this plugin audits.
//
// Each row in `auditEvents` pairs a hook name with `subject` /
// `actor` / `diff` / `extra` strategies; `registerAuditEvents` walks
// the table and registers one `ctx.addAction(...)` listener per row.
// Adding a new audit event means adding a row; the per-listener
// boilerplate (resolve appCtx → resolve subject + actor → call
// `service.record`) lives in one interpreter loop, not 28 closures.
//
// `assertRedactionInvariants` runs as a test against this table and
// `SUBJECT_REQUIRED_REDACTIONS`, so any row that audits a subject
// type carrying a known sensitive field (today: `user.passwordHash`)
// must include that field in `diff.omit` or the test fails — drift
// is caught at CI time, not in review.

import type {
  ApiToken,
  AppContext,
  AuthenticatedUser,
  Credential,
  Entry,
  EntryStatus,
  PluginSetupContext,
  User,
} from "plumix/plugin";
import { tryGetContext } from "plumix/plugin";

import type { NewAuditLogRow } from "../db/schema.js";
import type { AuditLogActor } from "../types.js";
import type { AuditService } from "./auditService.js";
import type { EntryMetaChanges } from "./entry-meta-changes.js";
import { buildAuditRow } from "./buildAuditRow.js";
import { extractSubject } from "./subjectExtractors.js";

// ──────────────────────────────────────────────────────────────────
// Row schema
// ──────────────────────────────────────────────────────────────────

interface ResolvedSubject {
  readonly type: string;
  readonly id: string;
  readonly label: string;
}

type SubjectStrategy =
  | {
      readonly kind: "extract";
      readonly type: string;
      /** Optional payload → extractor-input transform. Defaults to identity. */
      readonly from?: (payload: never, context: never) => unknown;
    }
  | {
      readonly kind: "inline";
      readonly type: string;
      readonly resolve: (
        payload: never,
        context: never,
      ) => { readonly id: string; readonly label: string };
    };

type ActorStrategy =
  | { readonly kind: "ctx" }
  /** `context.actor` is a `User`-shaped object passed by the hook firer. */
  | { readonly kind: "context-actor" }
  /** Payload itself is the user being acted on AND the actor (sign-in / sign-out / register — ctx.user is null at that point). */
  | { readonly kind: "self" }
  | {
      readonly kind: "custom";
      readonly resolve: (
        payload: never,
        context: never,
        appCtx: AppContext,
      ) => AuditLogActor;
    };

export interface AuditEventDef {
  readonly event: string;
  readonly subject: SubjectStrategy;
  readonly actor: ActorStrategy;
  /** Diff the top-level columns of `payload` (next) vs. `context` (previous), omitting these keys. */
  readonly diff?: { readonly omit: readonly string[] };
  /** Extra properties merged into the row's `properties` envelope. */
  readonly extra?: (
    payload: never,
    context: never,
    appCtx: AppContext,
  ) => Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────
// Strategy resolvers
// ──────────────────────────────────────────────────────────────────

function resolveSubject(
  strategy: SubjectStrategy,
  payload: unknown,
  context: unknown,
): ResolvedSubject {
  if (strategy.kind === "inline") {
    const partial = (
      strategy.resolve as (
        payload: unknown,
        context: unknown,
      ) => { readonly id: string; readonly label: string }
    )(payload, context);
    return { type: strategy.type, id: partial.id, label: partial.label };
  }
  const input = strategy.from
    ? (strategy.from as (payload: unknown, context: unknown) => unknown)(
        payload,
        context,
      )
    : payload;
  return extractSubject(
    strategy.type,
    input as Parameters<typeof extractSubject>[1],
  );
}

function resolveActor(
  strategy: ActorStrategy,
  payload: unknown,
  context: unknown,
  appCtx: AppContext,
): AuditLogActor {
  switch (strategy.kind) {
    case "ctx":
      return actorOf(appCtx);
    case "context-actor":
      return actorFromUser(
        (context as { readonly actor: AuthenticatedUser }).actor,
      );
    case "self":
      return actorFromUser(
        payload as { readonly id: number; readonly email: string },
      );
    case "custom":
      return (
        strategy.resolve as (
          payload: unknown,
          context: unknown,
          appCtx: AppContext,
        ) => AuditLogActor
      )(payload, context, appCtx);
  }
}

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
  source: Readonly<Record<string, unknown>>,
  omit: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (omit.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
// Row → audit-row reducer
// ──────────────────────────────────────────────────────────────────

function buildRow(
  def: AuditEventDef,
  payload: unknown,
  context: unknown,
  appCtx: AppContext,
): NewAuditLogRow {
  const subject = resolveSubject(def.subject, payload, context);
  const actor = resolveActor(def.actor, payload, context, appCtx);
  const previous = def.diff
    ? stripKeys(context as Readonly<Record<string, unknown>>, def.diff.omit)
    : undefined;
  const next = def.diff
    ? stripKeys(payload as Readonly<Record<string, unknown>>, def.diff.omit)
    : undefined;
  const extraProperties = def.extra
    ? (
        def.extra as (
          payload: unknown,
          context: unknown,
          appCtx: AppContext,
        ) => Record<string, unknown>
      )(payload, context, appCtx)
    : undefined;
  return buildAuditRow({
    event: def.event,
    actor,
    subject,
    previous,
    next,
    extraProperties,
  });
}

// ──────────────────────────────────────────────────────────────────
// Redaction guard
// ──────────────────────────────────────────────────────────────────

/**
 * Keys that MUST appear in every `diff.omit` for any row whose subject
 * is the given type. `passwordHash` is the canonical example — a
 * `user`-subject row that fails to omit it would leak the hash into
 * the audit table on every `user:updated`. New sensitive columns
 * gain a one-line entry here.
 */
export const SUBJECT_REQUIRED_REDACTIONS: Readonly<
  Record<string, readonly string[]>
> = {
  user: ["passwordHash"],
};

/**
 * Throws if any row in `events` audits a subject type listed in
 * `required` and fails to include all of the required keys in
 * `diff.omit`. Runs as a test against the live table; the failure
 * names the offending event so the fix is obvious.
 */
export function assertRedactionInvariants(
  events: readonly AuditEventDef[],
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
// Audit-event table
// ──────────────────────────────────────────────────────────────────

export const auditEvents: readonly AuditEventDef[] = [
  // ─── Entry surface ───
  {
    event: "entry:updated",
    subject: { kind: "extract", type: "entry" },
    actor: { kind: "ctx" },
    // Auto-managed timestamps would surface as a "diff" on every update;
    // nested JSON (`content` / `meta`) is covered by `entry:meta_changed`
    // so we don't double-count.
    diff: { omit: ["createdAt", "updatedAt", "content", "meta"] },
  },
  {
    event: "entry:transition",
    subject: { kind: "extract", type: "entry" },
    actor: { kind: "ctx" },
    extra: (entry: Entry, oldStatus: EntryStatus) => ({
      status: { from: oldStatus, to: entry.status },
    }),
  },
  {
    event: "entry:published",
    subject: { kind: "extract", type: "entry" },
    actor: { kind: "ctx" },
  },
  {
    event: "entry:trashed",
    subject: { kind: "extract", type: "entry" },
    actor: { kind: "ctx" },
  },
  {
    event: "entry:meta_changed",
    subject: {
      kind: "inline",
      type: "entry",
      resolve: (entry: { readonly id: number }) => ({
        id: String(entry.id),
        label: `Entry #${String(entry.id)}`,
      }),
    },
    actor: { kind: "ctx" },
    extra: (_entry: unknown, changes: EntryMetaChanges) => ({
      metaSet: Object.keys(changes.set),
      metaRemoved: changes.removed,
    }),
  },

  // ─── User surface ───
  {
    event: "user:updated",
    subject: { kind: "extract", type: "user" },
    actor: { kind: "ctx" },
    diff: {
      omit: ["createdAt", "updatedAt", "lastSignInAt", "passwordHash", "meta"],
    },
  },
  {
    event: "user:status_changed",
    subject: { kind: "extract", type: "user" },
    actor: { kind: "ctx" },
    // The diff renderer already understands `[old, new]` tuples; encode
    // the boolean toggle as one so the feed reads consistently.
    extra: (_user: User, context: { readonly enabled: boolean }) => ({
      status: [
        context.enabled ? "disabled" : "enabled",
        context.enabled ? "enabled" : "disabled",
      ],
    }),
  },
  {
    event: "user:deleted",
    subject: { kind: "extract", type: "user" },
    actor: { kind: "ctx" },
    extra: (
      _user: User,
      context: { readonly reassignedTo: number | null },
    ) => ({
      reassignedTo: context.reassignedTo,
    }),
  },
  {
    event: "user:meta_changed",
    subject: {
      kind: "inline",
      type: "user",
      resolve: (user: { readonly id: number }) => ({
        id: String(user.id),
        label: `User #${String(user.id)}`,
      }),
    },
    actor: { kind: "ctx" },
    extra: (_user: unknown, changes: EntryMetaChanges) => ({
      metaSet: Object.keys(changes.set),
      metaRemoved: changes.removed,
    }),
  },
  {
    event: "user:invited",
    subject: { kind: "extract", type: "user" },
    // The admin who initiated the invite is the actor. When the admin
    // is also the request's ctx.user, prefer their email as the label;
    // for CLI-initiated invites where ctx.user differs, fall back to
    // id-as-string. SECURITY: `inviteToken` is never recorded.
    actor: {
      kind: "custom",
      resolve: (
        _user: unknown,
        context: { readonly invitedBy: number },
        appCtx,
      ) => ({
        id: context.invitedBy,
        label:
          appCtx.user?.id === context.invitedBy
            ? appCtx.user.email
            : String(context.invitedBy),
      }),
    },
    extra: (_user: unknown, context: { readonly expiresAt: Date }) => ({
      expiresAt: context.expiresAt.toISOString(),
    }),
  },
  {
    event: "user:registered",
    subject: { kind: "extract", type: "user" },
    // Self-registration: `ctx.user` is null because the session is
    // being established in the same request, so attribute to the
    // payload directly.
    actor: { kind: "self" },
  },

  // ─── Auth surface ───
  {
    event: "user:signed_in",
    subject: { kind: "extract", type: "user" },
    // Sign-in middleware runs before auth completes, so ctx.user is
    // null at this point; self-attribution to the payload preserves
    // accurate authorship.
    actor: { kind: "self" },
    extra: (
      _user: User,
      context: {
        readonly method: string;
        readonly provider?: string;
        readonly firstSignIn: boolean;
      },
    ) => ({
      method: context.method,
      provider: context.provider ?? null,
      firstSignIn: context.firstSignIn,
    }),
  },
  {
    event: "user:signed_out",
    subject: { kind: "extract", type: "user" },
    actor: { kind: "self" },
  },
  {
    event: "user:email_change_requested",
    subject: { kind: "extract", type: "user" },
    // An admin may request the change for someone else; the hook
    // explicitly carries `context.actor`, prefer it over ctx.user so
    // the row reflects the responsible party.
    actor: { kind: "context-actor" },
    extra: (
      _user: User,
      context: { readonly newEmail: string; readonly expiresAt: Date },
    ) => ({
      newEmail: context.newEmail,
      expiresAt: context.expiresAt.toISOString(),
    }),
  },
  {
    event: "user:email_changed",
    subject: { kind: "extract", type: "user" },
    actor: { kind: "ctx" },
    extra: (user: User, context: { readonly previousEmail: string }) => ({
      email: [context.previousEmail, user.email],
    }),
  },
  {
    event: "credential:created",
    subject: { kind: "extract", type: "credential" },
    actor: { kind: "context-actor" },
    extra: (
      credential: Pick<
        Credential,
        "id" | "userId" | "name" | "deviceType" | "isBackedUp"
      >,
    ) => ({
      deviceType: credential.deviceType,
      isBackedUp: credential.isBackedUp,
      userId: credential.userId,
    }),
  },
  {
    event: "credential:revoked",
    subject: { kind: "extract", type: "credential" },
    actor: { kind: "context-actor" },
    extra: (credential: { readonly userId: number }) => ({
      userId: credential.userId,
    }),
  },
  {
    event: "credential:renamed",
    subject: {
      kind: "inline",
      type: "credential",
      resolve: (
        credential: { readonly id: string },
        context: { readonly name: string },
      ) => ({
        id: String(credential.id),
        label: context.name,
      }),
    },
    actor: { kind: "context-actor" },
    extra: (credential: { readonly userId: number }) => ({
      userId: credential.userId,
    }),
  },
  {
    event: "session:revoked",
    subject: { kind: "extract", type: "session" },
    actor: { kind: "context-actor" },
    extra: (
      session: { readonly userId: number },
      context: { readonly mode: "single" | "all_others" },
    ) => ({
      mode: context.mode,
      userId: session.userId,
    }),
  },
  {
    event: "api_token:created",
    subject: { kind: "extract", type: "api_token" },
    actor: { kind: "context-actor" },
    extra: (
      token: Pick<
        ApiToken,
        "id" | "userId" | "name" | "prefix" | "scopes" | "expiresAt"
      >,
    ) => ({
      prefix: token.prefix,
      scopes: token.scopes,
      userId: token.userId,
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
    }),
  },
  {
    event: "api_token:revoked",
    subject: { kind: "extract", type: "api_token" },
    actor: { kind: "context-actor" },
    extra: (
      token: { readonly userId: number },
      context: { readonly mode: "self" | "admin" },
    ) => ({
      mode: context.mode,
      userId: token.userId,
    }),
  },
  {
    event: "device_code:approved",
    // The user-facing handle for a device-code session is the
    // `userCode` (e.g. `ABCD-WXYZ`); feed it through the extractor as
    // `title` to match the device_code extractor's contract.
    subject: {
      kind: "extract",
      type: "device_code",
      from: (deviceCode: {
        readonly id: string;
        readonly userCode: string;
      }) => ({ id: deviceCode.id, title: deviceCode.userCode }),
    },
    actor: { kind: "context-actor" },
    extra: (deviceCode: {
      readonly tokenName: string;
      readonly scopes: readonly string[] | null;
    }) => ({
      tokenName: deviceCode.tokenName,
      scopes: deviceCode.scopes,
    }),
  },
  {
    event: "device_code:denied",
    subject: {
      kind: "extract",
      type: "device_code",
      from: (deviceCode: {
        readonly id: string;
        readonly userCode: string;
      }) => ({ id: deviceCode.id, title: deviceCode.userCode }),
    },
    actor: { kind: "context-actor" },
  },

  // ─── Term surface ───
  {
    event: "term:created",
    subject: { kind: "extract", type: "term" },
    actor: { kind: "ctx" },
  },
  {
    event: "term:updated",
    subject: { kind: "extract", type: "term" },
    actor: { kind: "ctx" },
    diff: { omit: ["createdAt", "updatedAt", "meta"] },
  },
  {
    event: "term:deleted",
    subject: { kind: "extract", type: "term" },
    actor: { kind: "ctx" },
  },
  {
    event: "term:meta_changed",
    subject: {
      kind: "inline",
      type: "term",
      resolve: (term: { readonly id: number }) => ({
        id: String(term.id),
        label: `Term #${String(term.id)}`,
      }),
    },
    actor: { kind: "ctx" },
    extra: (
      term: { readonly taxonomy: string },
      changes: EntryMetaChanges,
    ) => ({
      taxonomy: term.taxonomy,
      metaSet: Object.keys(changes.set),
      metaRemoved: changes.removed,
    }),
  },

  // ─── Settings surface ───
  {
    event: "settings:group_changed",
    // SECURITY: settings values can carry secrets (SMTP password,
    // OAuth client secret, API keys). Record only the changed key
    // names — never the values — so the audit table doesn't become
    // a credential mirror.
    subject: {
      kind: "inline",
      type: "settings_group",
      resolve: (changes: { readonly group: string }) => ({
        id: changes.group,
        label: changes.group,
      }),
    },
    actor: { kind: "ctx" },
    extra: (changes: {
      readonly set: Readonly<Record<string, unknown>>;
      readonly removed: readonly string[];
    }) => ({
      keysSet: Object.keys(changes.set),
      keysRemoved: changes.removed,
    }),
  },
];

// ──────────────────────────────────────────────────────────────────
// Interpreter
// ──────────────────────────────────────────────────────────────────

/**
 * Walk `auditEvents` and register one `ctx.addAction(...)` listener
 * per row. Each listener resolves the per-request `AppContext` from
 * the request store, falls back to `service.warnNoContextOnce()` on
 * a miss (typically a hook fired outside `requestStore.run`), and
 * otherwise routes a built row through `service.record`.
 */
export function registerAuditEvents(
  ctx: PluginSetupContext,
  service: AuditService,
): void {
  for (const def of auditEvents) {
    ctx.addAction(def.event as never, (...args: unknown[]) => {
      const appCtx = tryGetContext();
      if (!appCtx) {
        service.warnNoContextOnce();
        return;
      }
      service.record(appCtx, buildRow(def, args[0], args[1], appCtx));
    });
  }
}
