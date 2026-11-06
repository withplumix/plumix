import type { AppContext } from "../context/app-context.js";
import type { Entry, EntryStatus, NewEntry } from "../db/schema/entries.js";
import type { SettingsBag, SettingsGroupCopy } from "../db/schema/settings.js";
import type { Term } from "../db/schema/terms.js";
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
      output: SettingsGroupCopy,
      context: { readonly group: string },
      ctx: AppContext,
    ) => SettingsGroupCopy | Promise<SettingsGroupCopy>;

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
      output: SettingsGroupCopy,
      context: { readonly group: string },
      ctx: AppContext,
    ) => SettingsGroupCopy | Promise<SettingsGroupCopy>;

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

    /** Fires after `term.create` persists a new term row. */
    "term:created": (term: Term, ctx: AppContext) => void | Promise<void>;

    /**
     * Fires only when row columns other than meta changed; use
     * `term:meta_changed` for meta.
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

    /**
     * Not fired for a private (`_internal`) group, whose values are
     * server-side secrets.
     */
    "settings:group_changed": (
      changes: {
        readonly group: string;
        readonly set: SettingsBag;
        readonly removed: readonly string[];
      },
      ctx: AppContext,
    ) => void | Promise<void>;
  }
}

export {};
