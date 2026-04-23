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

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "rpc:entry.list:input": (input: EntryListInput) => EntryListInput;
    "rpc:entry.list:output": (output: readonly Entry[]) => readonly Entry[];

    "rpc:entry.get:input": (input: { id: number }) => typeof input;
    "rpc:entry.get:output": (output: Entry) => Entry;

    "rpc:entry.create:input": (input: EntryCreateInput) => EntryCreateInput;
    "rpc:entry.create:output": (output: Entry) => Entry;

    "rpc:entry.update:input": (input: EntryUpdateInput) => EntryUpdateInput;
    "rpc:entry.update:output": (output: Entry) => Entry;

    "rpc:entry.trash:input": (input: { id: number }) => typeof input;
    "rpc:entry.trash:output": (output: Entry) => Entry;

    "rpc:user.list:input": (input: UserListInput) => UserListInput;
    "rpc:user.list:output": (output: readonly User[]) => readonly User[];

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
     * parallel to `post:updated` / `user:updated`.
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
  }
}

export {};
