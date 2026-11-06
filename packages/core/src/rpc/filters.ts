import type { Entry } from "../db/schema/entries.js";
import type { Term } from "../db/schema/terms.js";
import type { AnyFilterDefinition } from "../hooks/define.js";
import type { WithResolvedMeta } from "../meta/contract/bags.js";
import type {
  EntryCreateInput,
  EntryListInput,
  EntryUpdateInput,
} from "./procedures/entry/schemas.js";
import type {
  TermCreateInput,
  TermListInput,
  TermUpdateInput,
} from "./procedures/term/schemas.js";
import { defineFilter } from "../hooks/define.js";

/**
 * `_preview` lets editor clients tell autosave-overlaid responses from
 * live reads.
 */
export type EntryWithTerms = WithResolvedMeta<Entry> & {
  readonly terms: Record<string, readonly number[]>;
  readonly _preview?: {
    readonly source: "live" | "autosave";
    readonly autosaveUpdatedAt: Date | null;
    readonly liveUpdatedAt: Date;
  };
};

type ResolvedEntry = WithResolvedMeta<Entry>;
type ResolvedTerm = WithResolvedMeta<Term>;

/**
 * The entry procedures' input, before it is read, and their output, before it
 * is sent. Unscoped: a list's input names no single type.
 */
export const entryRpc = {
  list: {
    input: defineFilter<EntryListInput>("entry:rpc.list.input", {
      sync: false,
    }),
    output: defineFilter<readonly ResolvedEntry[]>("entry:rpc.list.output", {
      sync: false,
    }),
  },
  get: {
    input: defineFilter<{ id: number; preview?: boolean }>(
      "entry:rpc.get.input",
      {
        sync: false,
      },
    ),
    output: defineFilter<EntryWithTerms>("entry:rpc.get.output", {
      sync: false,
    }),
  },
  create: {
    input: defineFilter<EntryCreateInput>("entry:rpc.create.input", {
      sync: false,
    }),
    output: defineFilter<ResolvedEntry>("entry:rpc.create.output", {
      sync: false,
    }),
  },
  update: {
    input: defineFilter<EntryUpdateInput>("entry:rpc.update.input", {
      sync: false,
    }),
    output: defineFilter<ResolvedEntry>("entry:rpc.update.output", {
      sync: false,
    }),
  },
  trash: {
    input: defineFilter<{ id: number }>("entry:rpc.trash.input", {
      sync: false,
    }),
    output: defineFilter<Entry>("entry:rpc.trash.output", { sync: false }),
  },
  restore: {
    input: defineFilter<{ id: number }>("entry:rpc.restore.input", {
      sync: false,
    }),
    output: defineFilter<Entry>("entry:rpc.restore.output", { sync: false }),
  },
  deletePermanent: {
    input: defineFilter<{ id: number }>("entry:rpc.deletePermanent.input", {
      sync: false,
    }),
    output: defineFilter<Entry>("entry:rpc.deletePermanent.output", {
      sync: false,
    }),
  },
  duplicate: {
    input: defineFilter<{ id: number }>("entry:rpc.duplicate.input", {
      sync: false,
    }),
    output: defineFilter<ResolvedEntry>("entry:rpc.duplicate.output", {
      sync: false,
    }),
  },
};

/** The term procedures' input and output; unscoped, as {@link entryRpc}. */
export const termRpc = {
  list: {
    input: defineFilter<TermListInput>("term:rpc.list.input", { sync: false }),
    output: defineFilter<readonly ResolvedTerm[]>("term:rpc.list.output", {
      sync: false,
    }),
  },
  get: {
    output: defineFilter<ResolvedTerm>("term:rpc.get.output", { sync: false }),
  },
  create: {
    input: defineFilter<TermCreateInput>("term:rpc.create.input", {
      sync: false,
    }),
    output: defineFilter<ResolvedTerm>("term:rpc.create.output", {
      sync: false,
    }),
  },
  update: {
    input: defineFilter<TermUpdateInput>("term:rpc.update.input", {
      sync: false,
    }),
    output: defineFilter<ResolvedTerm>("term:rpc.update.output", {
      sync: false,
    }),
  },
  delete: {
    output: defineFilter<Term>("term:rpc.delete.output", { sync: false }),
  },
};

const procedures: readonly Readonly<Record<string, AnyFilterDefinition>>[] = [
  ...Object.values(entryRpc),
  ...Object.values(termRpc),
];

/** Every RPC filter above, for the boot check on duplicate ids. */
export const rpcFilterDeclarations = procedures.flatMap((procedure) =>
  Object.values(procedure),
);
