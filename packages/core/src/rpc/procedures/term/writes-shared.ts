import type { Term } from "../../../db/schema/terms.js";
import type { ResolvedMeta } from "../../../meta/contract/bags.js";
import type { TermCreateInput, TermUpdateInput } from "./schemas.js";

export interface TermWritten {
  readonly term: Term;
  readonly meta: ResolvedMeta;
  readonly etag: string;
}

/** An entry attached to a term, as `entry_term` records it. */
export interface TermAssignment {
  readonly entryId: number;
  readonly termId: number;
}

/**
 * Term writes as the context's principal, down the path core's own term
 * procedures take. Checks no capability: the caller gates the write first.
 */
export interface TermWrites {
  create(input: TermCreateInput): Promise<TermWritten>;
  /** `ifMatch` and the edit lease are enforced as on `term.update`. */
  update(input: TermUpdateInput): Promise<TermWritten>;
  /** Children move to the root; the term's entry links go with it. */
  delete(id: number): Promise<Term>;
  /** Attaches the entry after the terms of that taxonomy it already has. */
  assign(assignment: TermAssignment): Promise<void>;
}

declare module "../../../context/app-context.js" {
  interface AppContextExtensions {
    readonly terms: TermWrites;
  }
}
