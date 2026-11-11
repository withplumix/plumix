import type { ShipHistory } from "./ship-history.js";
import type { Review } from "./ticket.js";

export async function reviewHead(
  issue: number,
  history: ShipHistory,
  ports: {
    readonly head: () => Promise<string>;
    readonly review: () => Promise<Review | null>;
  },
): Promise<Review | null> {
  const headSha = await ports.head();
  if (history.reviewedHead(issue) === headSha)
    return { summary: `Already reviewed ${headSha}`, specGaps: [], notes: [] };
  const review = await ports.review();
  if (!review || review.specGaps.length > 0) return review;
  if ((await ports.head()) !== headSha) return null;
  history.record({ type: "head.reviewed", issue, headSha });
  return review;
}
