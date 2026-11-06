import type { Term } from "../db/schema/terms.js";
import type { MetaChanges } from "../meta/contract/bags.js";
import { defineEvent } from "./define.js";
import { scopeDeclarations } from "./scope.js";

/** A term's events, as one taxonomy sees them. */
const declarations = {
  created: defineEvent<{ readonly term: Term }>("term:created"),
  /** Columns other than meta changed; `previous` is the row before. */
  updated: defineEvent<{ readonly term: Term; readonly previous: Term }>(
    "term:updated",
  ),
  /** The row is gone when this fires; `term` is its last state. */
  deleted: defineEvent<{ readonly term: Term }>("term:deleted"),
  /** A meta write landed: the decoded upserts and the cleared keys. */
  metaChanged: defineEvent<{
    readonly term: { readonly id: number; readonly taxonomy: string };
    readonly changes: MetaChanges;
  }>("term:metaChanged"),
};

/** What `term.for(taxonomy)` and `registerTermTaxonomy` return. */
export type TermTaxonomyHandle = typeof declarations;

/** Core's events about terms, before its RPC filters join. */
export const term = {
  ...declarations,
  /**
   * The same events, run only for terms of `taxonomy`. A taxonomy no plugin
   * registers fails boot.
   */
  for: (taxonomy: string): TermTaxonomyHandle =>
    scopeDeclarations(declarations, taxonomy),
};

/** Every declaration `term` holds, for the boot checks. */
export const termDeclarations = Object.values(declarations);
