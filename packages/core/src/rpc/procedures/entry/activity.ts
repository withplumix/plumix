import { inArray } from "drizzle-orm";
import * as v from "valibot";

import { entryCapabilityByName } from "../../../access/contract/entry-capabilities.js";
import { users } from "../../../db/schema/users.js";
import { loadAuthoredEntry } from "../../../entries/authored.js";
import { listActiveAutosaves } from "../../../revisions/repository.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { idParam } from "../../contract/validation.js";

const listInput = v.object({ entryId: idParam });

/** Polled over HTTP by admin clients, not real-time presence. */
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

export const list = base
  .use(authenticated)
  .input(listInput)
  .handler(async ({ input, context, errors }) => {
    const live = await loadAuthoredEntry(context.db, input.entryId);
    if (!live) {
      throw errors.NOT_FOUND({
        data: { kind: "entry", id: input.entryId },
      });
    }
    // Same gate as `entry.revisions.list` — co-author awareness
    // depends on reading other users' pending edits, which is the
    // same trust level as reading their historical revisions.
    const capability = entryCapabilityByName(
      context.plugins,
      live.type,
      "read_revisions",
    );
    if (!context.auth.can(capability)) {
      throw errors.FORBIDDEN({ data: { capability } });
    }

    const notOlderThan = new Date(Date.now() - ACTIVE_WINDOW_MS);
    const activeRows = await listActiveAutosaves(context.db, {
      entryId: input.entryId,
      notOlderThan,
      excludeAuthorId: context.user.id,
    });
    // Inline so TS infers the shape into the router type without a top-level
    // export, which knip would flag as unused.
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
