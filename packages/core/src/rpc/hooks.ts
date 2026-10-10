import type { AppContext, AuthenticatedUser } from "../context/app-context.js";
import type { ApiToken } from "../db/schema/api_tokens.js";
import type { Credential } from "../db/schema/credentials.js";
import type { Entry, EntryStatus, NewEntry } from "../db/schema/entries.js";
import type { SettingsBag } from "../db/schema/settings.js";
import type { Term } from "../db/schema/terms.js";
import type { User } from "../db/schema/users.js";
import type { WithResolvedMeta } from "../meta/contract/bags.js";
import type { EntryMetaChanges } from "../meta/entry.js";
import type { TermMetaChanges } from "../meta/term.js";
import type {
  EntryCreateInput,
  EntryListInput,
  EntryUpdateInput,
} from "./procedures/entry/schemas.js";
import type {
  SettingsGetInput,
  SettingsUpsertInput,
} from "./procedures/settings/schemas.js";
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

/**
 * `_preview` lets editor clients tell autosave-overlaid responses from
 * live reads.
 */
type EntryWithTerms = WithResolvedMeta<Entry> & {
  readonly terms: Record<string, readonly number[]>;
  readonly _preview?: {
    readonly source: "live" | "autosave";
    readonly autosaveUpdatedAt: Date | null;
    readonly liveUpdatedAt: Date;
  };
};

/**
 * `user.list` decorates each row with `lastSignInAt` (max session
 * createdAt per user), so the admin's users table can show "Active 2d
 * ago" / "Never". Plugin filters see the same shape.
 */
type UserListRow = User & {
  readonly lastSignInAt: Date | null;
};

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "rpc:entry.list:input": (input: EntryListInput) => EntryListInput;
    "rpc:entry.list:output": (
      output: readonly WithResolvedMeta<Entry>[],
    ) => readonly WithResolvedMeta<Entry>[];

    "rpc:entry.get:input": (input: {
      id: number;
      preview?: boolean;
    }) => typeof input;
    "rpc:entry.get:output": (output: EntryWithTerms) => EntryWithTerms;

    "rpc:entry.create:input": (input: EntryCreateInput) => EntryCreateInput;
    "rpc:entry.create:output": (
      output: WithResolvedMeta<Entry>,
    ) => WithResolvedMeta<Entry>;

    "rpc:entry.update:input": (input: EntryUpdateInput) => EntryUpdateInput;
    "rpc:entry.update:output": (
      output: WithResolvedMeta<Entry>,
    ) => WithResolvedMeta<Entry>;

    "rpc:entry.trash:input": (input: { id: number }) => typeof input;
    "rpc:entry.trash:output": (output: Entry) => Entry;

    "rpc:entry.restore:input": (input: { id: number }) => typeof input;
    "rpc:entry.restore:output": (output: Entry) => Entry;

    "rpc:entry.deletePermanent:input": (input: { id: number }) => typeof input;
    "rpc:entry.deletePermanent:output": (output: Entry) => Entry;

    "rpc:entry.duplicate:input": (input: { id: number }) => typeof input;
    "rpc:entry.duplicate:output": (
      output: WithResolvedMeta<Entry>,
    ) => WithResolvedMeta<Entry>;

    "rpc:user.list:input": (input: UserListInput) => UserListInput;
    "rpc:user.list:output": (
      output: readonly UserListRow[],
    ) => readonly UserListRow[];

    "rpc:user.get:output": (
      output: WithResolvedMeta<User>,
    ) => WithResolvedMeta<User>;

    "rpc:user.invite:input": (input: UserInviteInput) => UserInviteInput;
    "rpc:user.invite:output": (output: {
      user: User;
      inviteToken: string;
    }) => typeof output;

    "rpc:user.update:input": (input: UserUpdateInput) => UserUpdateInput;
    "rpc:user.update:output": (
      output: WithResolvedMeta<User>,
    ) => WithResolvedMeta<User>;

    "rpc:user.disable:input": (input: { id: number }) => typeof input;
    "rpc:user.disable:output": (output: User) => User;
    "rpc:user.enable:input": (input: { id: number }) => typeof input;
    "rpc:user.enable:output": (output: User) => User;
    "rpc:user.delete:output": (output: User) => User;

    "rpc:term.list:input": (input: TermListInput) => TermListInput;
    "rpc:term.list:output": (
      output: readonly WithResolvedMeta<Term>[],
    ) => readonly WithResolvedMeta<Term>[];

    "rpc:term.get:output": (
      output: WithResolvedMeta<Term>,
    ) => WithResolvedMeta<Term>;

    "rpc:term.create:input": (input: TermCreateInput) => TermCreateInput;
    "rpc:term.create:output": (
      output: WithResolvedMeta<Term>,
    ) => WithResolvedMeta<Term>;

    "rpc:term.update:input": (input: TermUpdateInput) => TermUpdateInput;
    "rpc:term.update:output": (
      output: WithResolvedMeta<Term>,
    ) => WithResolvedMeta<Term>;

    "rpc:term.delete:output": (output: Term) => Term;

    "rpc:settings.get:input": (input: SettingsGetInput) => SettingsGetInput;
    /**
     * Plugins can decorate, redact or replace the bag; the second argument
     * carries the group so one filter can branch on scope.
     */
    "rpc:settings.get:output": (
      output: SettingsBag,
      context: { readonly group: string },
      ctx: AppContext,
    ) => SettingsBag | Promise<SettingsBag>;

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
      output: SettingsBag,
      context: { readonly group: string },
      ctx: AppContext,
    ) => SettingsBag | Promise<SettingsBag>;

    /**
     * `entry:before_save` fires on every save; `entry:<type>:before_save`
     * fires the type-scoped variant first. Plugins can layer transforms
     * (type-specific → generic).
     */
    "entry:before_save": (entry: NewEntry) => NewEntry;
    [K: `entry:${string}:before_save`]: (entry: NewEntry) => NewEntry;
  }

  // Every action below hands its handler the context it fired from, last, so a
  // handler accepts what it depends on rather than reaching for the ambient
  // one.
  interface ActionRegistry {
    /**
     * Both `entry:<event>` and `entry:<type>:<event>` always fire, so a plugin
     * can target one entry type without re-filtering.
     */
    "entry:published": (entry: Entry, ctx: AppContext) => void | Promise<void>;
    "entry:updated": (
      entry: Entry,
      previous: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    "entry:trashed": (entry: Entry, ctx: AppContext) => void | Promise<void>;
    "entry:restored": (entry: Entry, ctx: AppContext) => void | Promise<void>;
    "entry:deleted": (entry: Entry, ctx: AppContext) => void | Promise<void>;
    "entry:transition": (
      entry: Entry,
      oldStatus: EntryStatus,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:published`]: (
      entry: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:updated`]: (
      entry: Entry,
      previous: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:trashed`]: (
      entry: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:restored`]: (
      entry: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:deleted`]: (
      entry: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:transition`]: (
      entry: Entry,
      oldStatus: EntryStatus,
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * Fire only on types with `supports: ['revisions']`. `revision_pruned`
     * fires only when the new snapshot pushed past `maxRevisions`.
     */
    "entry:revision_created": (
      revision: Entry,
      live: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    "entry:revision_pruned": (
      live: Entry,
      prunedCount: number,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:revision_created`]: (
      revision: Entry,
      live: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:revision_pruned`]: (
      live: Entry,
      prunedCount: number,
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * Autosave writes go to the caller's autosave row, not live, and
     * deliberately do NOT fire `entry:updated`, so cache invalidators ignore
     * pending drafts.
     */
    "entry:autosave_saved": (
      autosave: Entry,
      live: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    "entry:autosave_discarded": (
      live: Entry,
      authorId: number,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:autosave_saved`]: (
      autosave: Entry,
      live: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:autosave_discarded`]: (
      live: Entry,
      authorId: number,
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * On `supports: ['autosave']` types the restore lands on the caller's
     * autosave row; otherwise it writes live and also fires `entry:updated`.
     */
    "entry:revision_restored": (
      revision: Entry,
      destination: Entry,
      ctx: AppContext,
    ) => void | Promise<void>;
    [K: `entry:${string}:revision_restored`]: (
      revision: Entry,
      destination: Entry,
      ctx: AppContext,
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
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * SECURITY: `inviteToken` is the raw plaintext credential (the DB stores a
     * hash). Never log or forward it; it completes registration until consumed
     * or expired (7 days).
     */
    "user:invited": (
      user: User,
      context: {
        readonly inviteToken: string;
        readonly invitedBy: number;
        readonly expiresAt: Date;
      },
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * Fires on invite acceptance, not on `user:invited`. PII: the payload
     * carries `email`, `name` and `role`, as do all `user:*` actions.
     */
    "user:registered": (user: User, ctx: AppContext) => void | Promise<void>;

    /**
     * Fires only when row columns changed. `user.meta` here predates any meta
     * write in the same RPC, so use `user:meta_changed` for meta.
     */
    "user:updated": (
      user: User,
      previous: User,
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * Fires after a successful meta write via `user.update`. Payload
     * carries the decoded upserts + deleted keys — same shape as
     * `entry:meta_changed` / `term:meta_changed` so plugins adopt one
     * pattern across bags.
     */
    "user:meta_changed": (
      user: { readonly id: number },
      changes: UserMetaChanges,
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * Fires on both disable and re-enable. The user's sessions are already
     * invalidated when it fires.
     */
    "user:status_changed": (
      user: User,
      context: { readonly enabled: boolean },
      ctx: AppContext,
    ) => void | Promise<void>;

    /** `reassignedTo` is `null` when the deleted user had no entries. */
    "user:deleted": (
      user: User,
      context: { readonly reassignedTo: number | null },
      ctx: AppContext,
    ) => void | Promise<void>;

    /** Fires after `term.create` persists a new term row. */
    "term:created": (term: Term, ctx: AppContext) => void | Promise<void>;

    /**
     * Fires only when row columns changed. `term.meta` may lag a meta write in
     * the same RPC, so use `term:meta_changed` for meta.
     */
    "term:updated": (
      term: Term,
      previous: Term,
      ctx: AppContext,
    ) => void | Promise<void>;

    /** Fires after `term.delete` removes a term row. */
    "term:deleted": (term: Term, ctx: AppContext) => void | Promise<void>;

    /**
     * Fires after a successful meta write via `term.create` /
     * `term.update`. Payload carries the decoded upserts + deleted
     * keys — same shape as `entry:meta_changed` so plugins adopt one
     * pattern across bags.
     */
    "term:meta_changed": (
      term: { readonly id: number; readonly taxonomy: string },
      changes: TermMetaChanges,
      ctx: AppContext,
    ) => void | Promise<void>;

    "settings:group_changed": (
      changes: {
        readonly group: string;
        readonly set: SettingsBag;
        readonly removed: readonly string[];
      },
      ctx: AppContext,
    ) => void | Promise<void>;

    // Sign-in is split by `method` so an audit log can attribute it without
    // sniffing call paths. The actor travels in `context.actor`, not in
    // `revoked_by` columns.

    /**
     * Also fires on an external authenticator's first authenticated request.
     * `firstSignIn` is true only when this sign-in enrolled the user, not when
     * an existing user adds a passkey.
     */
    "user:signed_in": (
      user: User,
      context: {
        readonly method:
          "passkey" | "magic_link" | "oauth" | "invite" | "external";
        readonly provider?: string;
        readonly firstSignIn: boolean;
      },
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * A user signed out via the dedicated `/auth/signout` route. The
     * session row is already deleted by the time this fires.
     */
    "user:signed_out": (user: User, ctx: AppContext) => void | Promise<void>;

    /**
     * The email is NOT changed yet; see `user:email_changed`. `actor` differs
     * from `user` when an admin requests the change.
     */
    "user:email_change_requested": (
      user: User,
      context: {
        readonly actor: AuthenticatedUser;
        readonly newEmail: string;
        readonly expiresAt: Date;
      },
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * The user's sessions are already invalidated when this fires, so don't
     * assume the actor's session still exists.
     */
    "user:email_changed": (
      user: User,
      context: { readonly previousEmail: string },
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * Also fires on first signup and invite-accept. The payload omits the
     * public key; read the full row from `context.db`.
     */
    "credential:created": (
      credential: Pick<
        Credential,
        "id" | "userId" | "name" | "deviceType" | "isBackedUp"
      >,
      context: { readonly actor: AuthenticatedUser },
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * A passkey was revoked via `auth.credentials.delete`. Self-only —
     * cross-user passkey deletion is intentionally not a feature, so
     * `actor.id === credential.userId` always.
     */
    "credential:revoked": (
      credential: { readonly id: string; readonly userId: number },
      context: { readonly actor: AuthenticatedUser },
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * A passkey was renamed via `auth.credentials.rename`. Same
     * self-only contract as `credential:revoked`.
     */
    "credential:renamed": (
      credential: { readonly id: string; readonly userId: number },
      context: { readonly actor: AuthenticatedUser; readonly name: string },
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * Only the caller's own sessions can be revoked. `mode` tells a single
     * revoke from "everywhere except this browser".
     */
    "session:revoked": (
      session: { readonly id: string; readonly userId: number },
      context: {
        readonly actor: AuthenticatedUser;
        readonly mode: "single" | "all_others";
      },
      ctx: AppContext,
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
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * `mode: "self"` for the owner's `revoke`, `mode: "admin"` for
     * `adminRevoke`.
     */
    "api_token:revoked": (
      token: { readonly id: string; readonly userId: number },
      context: {
        readonly actor: AuthenticatedUser;
        readonly mode: "self" | "admin";
      },
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * Fires at approval, before the polling client mints the token, so the
     * human's decision is recorded separately from the mint.
     */
    "device_code:approved": (
      deviceCode: {
        readonly id: string;
        readonly userCode: string;
        readonly tokenName: string;
        readonly scopes: readonly string[] | null;
      },
      context: { readonly actor: AuthenticatedUser },
      ctx: AppContext,
    ) => void | Promise<void>;

    /**
     * A device-flow session was denied via `auth.deviceFlow.deny`.
     * Polling client gets `access_denied` on the next exchange.
     */
    "device_code:denied": (
      deviceCode: { readonly id: string; readonly userCode: string },
      context: { readonly actor: AuthenticatedUser },
      ctx: AppContext,
    ) => void | Promise<void>;
  }
}

export {};
