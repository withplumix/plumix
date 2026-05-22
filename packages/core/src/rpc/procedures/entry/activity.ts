import { inArray } from "drizzle-orm";
import * as v from "valibot";

import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { users } from "../../../db/schema/users.js";
import { listActiveAutosaves } from "../../../revisions/repository.js";
import { isReservedType } from "../../../revisions/slug-codec.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { idParam } from "../../validation.js";
import { entryCapability } from "./lifecycle.js";

const listInput = v.object({ entryId: idParam });

// Five-minute "actively editing" window per #293. Pure HTTP polling,
// not real-time presence — admin clients poll every ~30 s with a
// short `staleTime`. The window is forward-compatible with a future
// SSE upgrade since the wire shape is just the user list.
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;


// Returns the users currently editing `entryId` — autosave rows
// touched within the last five minutes — excluding the caller. Empty
// list when no co-authors are active. Polled by the editor header to
// surface a "X is also editing this" indicator before the user
// hits Publish.
export const list = base
  .use(authenticated)
  .input(listInput)
  .handler(async ({ input, context, errors }) => {
    const live = await context.db.query.entries.findFirst({
      where: eq(entries.id, input.entryId),
    });
    if (!live) {
      throw errors.NOT_FOUND({
        data: { kind: "entry", id: input.entryId },
      });
    }
    if (isReservedType(live.type)) {
      throw errors.BAD_REQUEST({ data: { reason: "reserved_type" } });
    }
    // Same gate as `entry.revisions.list` — co-author awareness
    // depends on reading other users' pending edits, which is the
    // same trust level as reading their historical revisions.
    const capability = entryCapability(live.type, "read_revisions");
    if (!context.auth.can(capability)) {
      throw errors.FORBIDDEN({ data: { capability } });
    }

    const notOlderThan = new Date(Date.now() - ACTIVE_WINDOW_MS);
    const activeRows = await listActiveAutosaves(context.db, {
      entryId: input.entryId,
      notOlderThan,
      excludeAuthorId: context.user.id,
    });
    // Inline element shape — naming the interface here would force
    // an `export` (so the router-output type can name it), and knip
    // flags unused exports. The anonymous literal lets TS infer the
    // shape into the router type without a top-level export.
    const items: {
      id: number;
      name: string | null;
      email: string;
      lastSeenAt: Date;
    }[] = [];
    if (activeRows.length === 0) return { users: items };

    const authorIds = Array.from(new Set(activeRows.map((r) => r.authorId)));
    const authorRows = await context.db.query.users.findMany({
      where: inArray(users.id, authorIds),
    });
    const userById = new Map(authorRows.map((u) => [u.id, u]));
    for (const row of activeRows) {
      const user = userById.get(row.authorId);
      if (!user) continue;
      items.push({
        id: user.id,
        name: user.name,
        email: user.email,
        lastSeenAt: row.updatedAt,
      });
    }
    return { users: items };
  });
