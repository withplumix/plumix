import type { AuthenticatedUser } from "../context/app.js";
import type { ApiToken } from "../db/schema/api_tokens.js";
import type { Credential } from "../db/schema/credentials.js";
import type { Entry, EntryStatus, NewEntry } from "../db/schema/entries.js";
import type { Term } from "../db/schema/terms.js";
import type { User } from "../db/schema/users.js";
import type { EntryMetaChanges } from "./procedures/entry/meta.js";
import type {
  EntryCreateInput,
  EntryListInput,
  EntryUpdateInput,
} from "./procedures/entry/schemas.js";
import type {
  SettingsGetInput,
  SettingsUpsertInput,
} from "./procedures/settings/schemas.js";
import type { TermMetaChanges } from "./procedures/term/meta.js";
import type {
  TermCreateInput,
  TermListInput,
  TermUpdateInput,
} from "./procedures/term/schemas.js";
import type { UserMetaChanges } from "./procedures/user/meta.js";
import type {
  UserInviteInput,
  UserListInput,
  UserUpdateInput,
} from "./procedures/user/schemas.js";

// `entry.get` enriches the row with the assigned term ids per
// taxonomy. Plugins editing the output filter receive this shape.
type EntryWithTerms = Entry & {
  readonly terms: Record<string, readonly number[]>;
};

// `user.list` decorates each row with `lastSignInAt` (max session
// createdAt per user), so the admin's users table can show "Active 2d
// ago" / "Never". Plugin filters see the same shape.
type UserListRow = User & {
  readonly lastSignInAt: Date | null;
};

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "rpc:entry.list:input": (input: EntryListInput) => EntryListInput;
    "rpc:entry.list:output": (output: readonly Entry[]) => readonly Entry[];

    "rpc:entry.get:input": (input: { id: number }) => typeof input;
    "rpc:entry.get:output": (output: EntryWithTerms) => EntryWithTerms;

    "rpc:entry.create:input": (input: EntryCreateInput) => EntryCreateInput;
    "rpc:entry.create:output": (output: Entry) => Entry;

    "rpc:entry.update:input": (input: EntryUpdateInput) => EntryUpdateInput;
    "rpc:entry.update:output": (output: Entry) => Entry;

    "rpc:entry.trash:input": (input: { id: number }) => typeof input;
    "rpc:entry.trash:output": (output: Entry) => Entry;

    "rpc:user.list:input": (input: UserListInput) => UserListInput;
    "rpc:user.list:output": (
      output: readonly UserListRow[],
    ) => readonly UserListRow[];

    "rpc:user.get:output": (output: User) => User;

    "rpc:user.invite:input": (input: UserInviteInput) => UserInviteInput;
    "rpc:user.invite:output": (output: {
      user: User;
      inviteToken: string;
    }) => typeof output;

    "rpc:user.update:input": (input: UserUpdateInput) => UserUpdateInput;
    "rpc:user.update:output": (output: User) => User;

    "rpc:user.disable:input": (input: { id: number }) => typeof input;
    "rpc:user.disable:output": (output: User) => User;
    "rpc:user.enable:input": (input: { id: number }) => typeof input;
    "rpc:user.enable:output": (output: User) => User;
    "rpc:user.delete:output": (output: User) => User;

    "rpc:term.list:input": (input: TermListInput) => TermListInput;
    "rpc:term.list:output": (output: readonly Term[]) => readonly Term[];

    "rpc:term.get:output": (output: Term) => Term;

    "rpc:term.create:input": (input: TermCreateInput) => TermCreateInput;
    "rpc:term.create:output": (output: Term) => Term;

    "rpc:term.update:input": (input: TermUpdateInput) => TermUpdateInput;
    "rpc:term.update:output": (output: Term) => Term;

    "rpc:term.delete:output": (output: Term) => Term;

    "rpc:settings.get:input": (input: SettingsGetInput) => SettingsGetInput;
    /**
     * Output filter for the `settings.get` bag. Plugins can decorate
     * (inject derived keys), redact secrets, or replace the bag
     * entirely. Second argument carries the group name so one filter
     * can branch on scope.
     */
    "rpc:settings.get:output": (
      output: Readonly<Record<string, unknown>>,
      context: { readonly group: string },
    ) =>
      | Readonly<Record<string, unknown>>
      | Promise<Readonly<Record<string, unknown>>>;

    "rpc:settings.upsert:input": (
      input: SettingsUpsertInput,
    ) => SettingsUpsertInput;
    /**
     * Output filter for `settings.upsert`. Runs on the authoritative
     * bag after the write. Same context shape as `settings.get:output`
     * so plugins can share a single decorator across read and write
     * paths.
     */
    "rpc:settings.upsert:output": (
      output: Readonly<Record<string, unknown>>,
      context: { readonly group: string },
    ) =>
      | Readonly<Record<string, unknown>>
      | Promise<Readonly<Record<string, unknown>>>;

    /**
     * `entry:before_save` fires on every save; `entry:<type>:before_save`
     * fires the type-scoped variant first. Plugins can layer transforms
     * (type-specific → generic).
     */
    "entry:before_save": (entry: NewEntry) => NewEntry;
    [K: `entry:${string}:before_save`]: (entry: NewEntry) => NewEntry;
  }

  interface ActionRegistry {
    /**
     * Entry lifecycle. `entry:<event>` fires for every entry regardless
     * of type; `entry:<type>:<event>` also fires so plugins can target
     * one entry type without re-filtering inside a generic handler.
     * Both always fire — subscribe to whichever granularity you need.
     */
    "entry:published": (entry: Entry) => void | Promise<void>;
    "entry:updated": (entry: Entry, previous: Entry) => void | Promise<void>;
    "entry:trashed": (entry: Entry) => void | Promise<void>;
    "entry:transition": (
      entry: Entry,
      oldStatus: EntryStatus,
    ) => void | Promise<void>;
    [K: `entry:${string}:published`]: (entry: Entry) => void | Promise<void>;
    [K: `entry:${string}:updated`]: (
      entry: Entry,
      previous: Entry,
    ) => void | Promise<void>;
    [K: `entry:${string}:trashed`]: (entry: Entry) => void | Promise<void>;
    [K: `entry:${string}:transition`]: (
      entry: Entry,
      oldStatus: EntryStatus,
    ) => void | Promise<void>;

    /**
     * Fires after a successful meta write. Payload carries the decoded
     * upserts + deleted keys — matches WP's `updated_post_meta` /
     * `deleted_post_meta` / `added_post_meta` collapsed into one
     * action.
     */
    "entry:meta_changed": (
      entry: { readonly id: number; readonly type: string },
      changes: EntryMetaChanges,
    ) => void | Promise<void>;

    /**
     * Fires after `user.invite` persists the pending user + token. Main
     * consumer is an email-delivery plugin composing the invite link
     * from `inviteToken`. Payload matches WP's `user_register` plus
     * invite-specific fields — plugins listening on both `user:invited`
     * and `user:registered` can tell "invite sent" from "invite taken".
     *
     * SECURITY: `inviteToken` is the raw plaintext (the DB stores only a
     * hash). Treat it as a credential — do NOT log it, persist it
     * outside the consuming plugin's scope, or forward it to analytics /
     * error-tracking services. A leaked token grants anyone the ability
     * to complete registration as the invited user until it's consumed
     * or expires (7 days).
     */
    "user:invited": (
      user: User,
      context: {
        readonly inviteToken: string;
        readonly invitedBy: number;
        readonly expiresAt: Date;
      },
    ) => void | Promise<void>;

    /**
     * Fires after a user completes invite acceptance (passkey persisted,
     * invite token consumed, session created). Parallel to WordPress's
     * `user_register` when the user comes online for the first time.
     * Use this (not `user:invited`) for onboarding flows like welcome
     * emails or default-content seeding.
     *
     * PII: payload carries `email`, `name`, `role`. Don't ship the full
     * row to third-party log/analytics services without the user's
     * consent. Same caveat applies to all `user:*` actions below.
     */
    "user:registered": (user: User) => void | Promise<void>;

    /**
     * Fires after a successful `user.update` row-columns write. Payload
     * carries the post-write row and the pre-write row for diffing —
     * matches WP's `profile_update(user_id, old_user_data)` signature.
     * Use this instead of the output filter when you need to know what
     * actually changed (role demotion, email swap, etc.).
     *
     * Only fires when row columns changed. A meta-only update does NOT
     * fire `user:updated`; subscribe to `user:meta_changed` for that.
     * The `user.meta` on the payload is the row's `.returning()` value
     * captured *before* the meta write — so when the same RPC writes
     * both row columns and meta, `user.meta` here is deterministically
     * stale. Always subscribe to `user:meta_changed` for the
     * authoritative meta diff.
     */
    "user:updated": (user: User, previous: User) => void | Promise<void>;

    /**
     * Fires after a successful meta write via `user.update`. Payload
     * carries the decoded upserts + deleted keys — same shape as
     * `entry:meta_changed` / `term:meta_changed` so plugins adopt one
     * pattern across bags.
     */
    "user:meta_changed": (
      user: { readonly id: number },
      changes: UserMetaChanges,
    ) => void | Promise<void>;

    /**
     * Fires on both disable (`enabled: false`) and re-enable
     * (`enabled: true`). One surface so "account state changed" is a
     * single subscription, instead of two. Sessions for the affected
     * user are already invalidated by the time this fires.
     */
    "user:status_changed": (
      user: User,
      context: { readonly enabled: boolean },
    ) => void | Promise<void>;

    /**
     * Fires after a successful `user.delete`. `reassignedTo` is the
     * user id that inherited this account's entries, or `null` if the
     * deleted user had no entries (so no reassignment happened). Mirrors
     * WP's `deleted_user(user_id, reassign_to)`.
     */
    "user:deleted": (
      user: User,
      context: { readonly reassignedTo: number | null },
    ) => void | Promise<void>;

    /** Fires after `term.create` persists a new term row. */
    "term:created": (term: Term) => void | Promise<void>;

    /**
     * Fires after a successful `term.update` row-columns write. Payload
     * carries the post-write row and the pre-write row for diffing —
     * parallel to `entry:updated` / `user:updated`.
     *
     * Only fires when the row columns changed. A meta-only update does
     * NOT fire `term:updated`; subscribe to `term:meta_changed` for
     * that. The `term.meta` here reflects the row read right after the
     * column write and may lag a meta write that happens in the same
     * RPC call — use `term:meta_changed` for the authoritative meta
     * diff.
     */
    "term:updated": (term: Term, previous: Term) => void | Promise<void>;

    /** Fires after `term.delete` removes a term row. */
    "term:deleted": (term: Term) => void | Promise<void>;

    /**
     * Fires after a successful meta write via `term.create` /
     * `term.update`. Payload carries the decoded upserts + deleted
     * keys — same shape as `entry:meta_changed` so plugins adopt one
     * pattern across bags.
     */
    "term:meta_changed": (
      term: { readonly id: number; readonly taxonomy: string },
      changes: TermMetaChanges,
    ) => void | Promise<void>;

    /**
     * Fires after a successful `settings.upsert`. Payload carries the
     * group name plus the per-request `set` upserts and `removed`
     * keys — shape mirrors `entry:meta_changed` so plugins can adopt
     * the same pattern across bags. Subscribe for audit logs,
     * cache-invalidators, derived-setting backfills.
     */
    "settings:group_changed": (changes: {
      readonly group: string;
      readonly set: Readonly<Record<string, unknown>>;
      readonly removed: readonly string[];
    }) => void | Promise<void>;

    // ──────────────────────────────────────────────────────────────────
    // Auth / sign-in events.
    //
    // These mirror the WP `wp_login` / `wp_logout` surface but adopt
    // the plumix `entity:event` shape and split sign-in by `method`
    // so an audit-log plugin can attribute "via passkey" vs "via
    // OAuth (github)" without sniffing call paths.
    //
    // The audit-log story: subscribe to `auth:*`, `session:*`,
    // `credential:*`, `api_token:*`, `device_code:*` and write one
    // row per emission. No `revoked_by` columns anywhere — the actor
    // travels in `context.actor`. Avoids schema bloat that becomes
    // dead weight once the audit table lands.
    // ──────────────────────────────────────────────────────────────────

    /**
     * A user just signed in. Fires from every sign-in path:
     * passkey, magic-link, OAuth callback, invite-accept, and any
     * external IdP authenticator (cfAccess, etc.) on its first
     * authenticated request.
     *
     * `method` distinguishes the surface; `provider` is set only for
     * `oauth` so subscribers can branch on `github` vs `google` etc.
     * `firstSignIn` is true when this is the user's first session
     * ever (signup-then-signin paths set it once, subsequent logins
     * are false).
     */
    "user:signed_in": (
      user: User,
      context: {
        readonly method:
          | "passkey"
          | "magic_link"
          | "oauth"
          | "invite"
          | "external";
        readonly provider?: string;
        readonly firstSignIn: boolean;
      },
    ) => void | Promise<void>;

    /**
     * A user signed out via the dedicated `/auth/signout` route. The
     * session row is already deleted by the time this fires.
     */
    "user:signed_out": (user: User) => void | Promise<void>;

    /**
     * Fires after `user.requestEmailChange` writes the verification
     * token + sends the confirmation mail. `actor` may differ from
     * `user` when an admin requests the change for another user.
     * Email is NOT changed yet — see `user:email_changed`.
     */
    "user:email_change_requested": (
      user: User,
      context: {
        readonly actor: AuthenticatedUser;
        readonly newEmail: string;
        readonly expiresAt: Date;
      },
    ) => void | Promise<void>;

    /**
     * Fires after the verification link is clicked and the email
     * commit lands. Payload has the post-write user (with new
     * email + reset `emailVerifiedAt`) and the previous email for
     * diff. Sessions for this user are invalidated by the time this
     * fires — subscribers should not assume the actor's session
     * still exists.
     */
    "user:email_changed": (
      user: User,
      context: { readonly previousEmail: string },
    ) => void | Promise<void>;

    /**
     * A passkey was registered. Fires on first signup, invite-accept,
     * and the "add another passkey" flow. Payload omits the public-key
     * blob to keep wire-friendly subscribers small; pull from `context.db`
     * if you need the full row.
     */
    "credential:created": (
      credential: Pick<
        Credential,
        "id" | "userId" | "name" | "deviceType" | "isBackedUp"
      >,
      context: { readonly actor: AuthenticatedUser },
    ) => void | Promise<void>;

    /**
     * A passkey was revoked via `auth.credentials.delete`. Self-only —
     * cross-user passkey deletion is intentionally not a feature, so
     * `actor.id === credential.userId` always.
     */
    "credential:revoked": (
      credential: { readonly id: string; readonly userId: number },
      context: { readonly actor: AuthenticatedUser },
    ) => void | Promise<void>;

    /**
     * A passkey was renamed via `auth.credentials.rename`. Same
     * self-only contract as `credential:revoked`.
     */
    "credential:renamed": (
      credential: { readonly id: string; readonly userId: number },
      context: { readonly actor: AuthenticatedUser; readonly name: string },
    ) => void | Promise<void>;

    /**
     * A browser session was explicitly revoked via `auth.sessions.revoke`
     * or `auth.sessions.revokeOthers`. `mode` distinguishes single-row
     * revoke from "everywhere except this browser" so the audit log
     * can render either as one event or N. Cross-user revocation isn't
     * exposed — sessions are second-factor security primitives.
     */
    "session:revoked": (
      session: { readonly id: string; readonly userId: number },
      context: {
        readonly actor: AuthenticatedUser;
        readonly mode: "single" | "all_others";
      },
    ) => void | Promise<void>;

    /**
     * A personal access token was minted via `auth.apiTokens.create`.
     * Token row is shipped sans secret (PK = SHA-256 hash). Mint is
     * always self-action — you can't mint for another user — so
     * `actor.id === token.userId`.
     */
    "api_token:created": (
      token: Pick<
        ApiToken,
        "id" | "userId" | "name" | "prefix" | "scopes" | "expiresAt"
      >,
      context: { readonly actor: AuthenticatedUser },
    ) => void | Promise<void>;

    /**
     * A personal access token was revoked. `mode: "self"` for the
     * owner using `auth.apiTokens.revoke`; `mode: "admin"` for an
     * admin-with-`user:manage_tokens` using `adminRevoke`. Audit log
     * uses `mode` to pick copy ("you revoked" vs "admin X revoked").
     */
    "api_token:revoked": (
      token: { readonly id: string; readonly userId: number },
      context: {
        readonly actor: AuthenticatedUser;
        readonly mode: "self" | "admin";
      },
    ) => void | Promise<void>;

    /**
     * A device-flow session was approved via `auth.deviceFlow.approve`.
     * The polling client's next exchange will mint the API token; this
     * fires at approval time so the audit log captures the human's
     * decision separately from the token mint.
     */
    "device_code:approved": (
      deviceCode: {
        readonly id: string;
        readonly userCode: string;
        readonly tokenName: string;
        readonly scopes: readonly string[] | null;
      },
      context: { readonly actor: AuthenticatedUser },
    ) => void | Promise<void>;

    /**
     * A device-flow session was denied via `auth.deviceFlow.deny`.
     * Polling client gets `access_denied` on the next exchange.
     */
    "device_code:denied": (
      deviceCode: { readonly id: string; readonly userCode: string },
      context: { readonly actor: AuthenticatedUser },
    ) => void | Promise<void>;
  }
}

export {};
