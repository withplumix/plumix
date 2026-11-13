import type { ShipHistory } from "./ship-history.js";

/**
 * A stop goes back for clearer instructions rather than to a person, unless
 * the decider says a person must choose. Twice per ticket, wherever the stop
 * happens, so the loop never argues with itself for long.
 */
export const REPLANS_A_TICKET_GETS = 2;

export type Decide = (reason: string) => Promise<string | null>;

/** Decides within the ticket's journaled re-plans; null once they are used up or a person must choose. */
export function replanning(
  history: Pick<ShipHistory, "replans" | "record">,
  issue: number,
  decide: Decide,
): Decide {
  return async (reason) => {
    if (history.replans(issue).length >= REPLANS_A_TICKET_GETS) return null;
    const decision = await decide(reason);
    if (decision === null) return null;
    history.record({ type: "brief.amended", issue, reason, decision });
    return decision;
  };
}
