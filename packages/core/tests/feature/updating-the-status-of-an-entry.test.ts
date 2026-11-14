import { describe, expect, test } from "vitest";

import type { Entry, EntryStatus } from "../../src/db/schema/entries.js";
import type { AppRouterClient } from "../../src/rpc/router.js";
import { etagOf } from "../../src/db/concurrency.js";
import { ENTRY_STATUSES } from "../../src/db/schema/entries.js";
import { entry } from "../../src/events-and-filters/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { ENTRY_STATUS_MOVES } from "../../src/rpc/procedures/entry/status-moves.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
  },
});

const site = await testSite({
  plugins: [posts],
  config: {
    roles: {
      contributor: {
        can: {
          admin: ["access"],
          entry: { post: ["read", "create", "edit_own", "delete"] },
        },
      },
    },
  },
});

describe("publishing a draft through an update", () => {
  test("stamps its publish date and emits entry.published and entry.transition once each", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      status: "published",
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.status).toBe("published");
    expect(updated.publishedAt).toEqual(new Date("2026-10-18T12:00:00Z"));
    expect(site.events.emitted(entry.published)).toHaveLength(1);
    expect(site.events.emitted(entry.transition)).toHaveLength(1);
  });

  test("from one copy in three racing saves publishes once and emits entry.published once", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });
    const ifMatch = etagOf(own.updatedAt);
    const rpc = site.actingAs(author).rpc;

    const outcomes = await Promise.allSettled([
      rpc.entry.update({ id: own.id, status: "published", ifMatch }),
      rpc.entry.update({ id: own.id, status: "published", ifMatch }),
      rpc.entry.update({ id: own.id, status: "published", ifMatch }),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      "fulfilled",
      "rejected",
      "rejected",
    ]);
    expect(site.events.emitted(entry.published)).toHaveLength(1);
  });
});

describe("scheduling a draft through an update", () => {
  test("stores the future publish date and keeps the entry scheduled", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      status: "scheduled",
      publishedAt: new Date("2026-10-18T13:00:00Z"),
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.status).toBe("scheduled");
    expect(updated.publishedAt).toEqual(new Date("2026-10-18T13:00:00Z"));
  });

  test("without a publish date is refused", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      status: "scheduled",
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "scheduled_requires_future_date" },
    });
  });
});

describe("updating a scheduled entry", () => {
  test("past its publish date, still awaiting the cron, is not refused", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const author = await site.factory.author.create();
    const due = await site.factory.entry.create({
      authorId: author.id,
      status: "scheduled",
      publishedAt: new Date("2026-10-18T11:59:59Z"),
    });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: due.id,
      title: "fixed a typo",
      ifMatch: etagOf(due.updatedAt),
    });

    expect(updated.title).toBe("fixed a typo");
    expect(updated.status).toBe("scheduled");
  });

  test("to publish it before its date stamps the publish date now", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const author = await site.factory.author.create();
    const scheduled = await site.factory.entry.create({
      authorId: author.id,
      status: "scheduled",
      publishedAt: new Date("2026-10-19T12:00:00Z"),
    });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: scheduled.id,
      status: "published",
      ifMatch: etagOf(scheduled.updatedAt),
    });

    expect(updated.status).toBe("published");
    expect(updated.publishedAt).toEqual(new Date("2026-10-18T12:00:00Z"));
  });
});

/** Far enough ahead that a scheduled entry or save is never due. */
const LATER = new Date("2999-01-01T00:00:00Z");

const callProcedure: Record<
  (typeof ENTRY_STATUS_MOVES)[number]["procedure"],
  (rpc: AppRouterClient, row: Entry) => Promise<unknown>
> = {
  trash: (rpc, row) => rpc.entry.trash({ id: row.id }),
  restore: (rpc, row) => rpc.entry.restore({ id: row.id }),
  publish: (rpc, row) =>
    rpc.entry.publish({ id: row.id, ifMatch: etagOf(row.updatedAt) }),
};

async function isForbidden(call: Promise<unknown>): Promise<boolean> {
  return call.then(
    () => false,
    (error: unknown) => (error as { code?: string }).code === "FORBIDDEN",
  );
}

function publishedAtFor(status: EntryStatus): Date | undefined {
  return status === "scheduled" ? LATER : undefined;
}

async function ownEntry(authorId: number, status: EntryStatus) {
  return site.factory.entry.create({
    authorId,
    status,
    publishedAt: publishedAtFor(status),
  });
}

/** Whether any of `procedures` refuses `user` the move away from `from`. */
async function refusedByOwners(
  user: Awaited<ReturnType<typeof site.factory.user.create>>,
  from: EntryStatus,
  procedures: readonly (keyof typeof callProcedure)[],
): Promise<boolean> {
  const rpc = site.actingAs(user).rpc;
  const refusals = await Promise.all(
    procedures.map(async (procedure) =>
      isForbidden(callProcedure[procedure](rpc, await ownEntry(user.id, from))),
    ),
  );
  return refusals.includes(true);
}

const ROLES = ["member", "contributor", "author", "editor"] as const;

const ownedMoves = ENTRY_STATUSES.flatMap((from) =>
  ENTRY_STATUSES.map((to) => ({
    from,
    to,
    owners: ENTRY_STATUS_MOVES.filter((move) => move.covers(from, to)).map(
      ({ procedure }) => procedure,
    ),
  })),
).filter(({ owners }) => owners.length > 0);

describe("moving an entry between statuses through an update", () => {
  for (const { from, to, owners } of ownedMoves) {
    for (const role of ROLES) {
      test(`from ${from} to ${to} is refused to the ${role} exactly when entry.${owners.join(" or entry.")} refuses them`, async () => {
        const user = await site.factory.user.create({ role });
        const own = await ownEntry(user.id, from);
        const expected = await refusedByOwners(user, from, owners);

        const refused = await isForbidden(
          site.actingAs(user).rpc.entry.update({
            id: own.id,
            status: to,
            publishedAt: publishedAtFor(to),
            ifMatch: etagOf(own.updatedAt),
          }),
        );

        expect(refused).toBe(expected);
      });
    }
  }

  test("has each status-owning procedure refuse one of the roles and let another through", async () => {
    const seen = new Set<string>();
    for (const { from, owners } of ownedMoves) {
      for (const role of ROLES) {
        const user = await site.factory.user.create({ role });
        for (const procedure of owners) {
          seen.add(
            `${procedure}:${String(await refusedByOwners(user, from, [procedure]))}`,
          );
        }
      }
    }

    expect([...seen].sort()).toEqual([
      "publish:false",
      "publish:true",
      "restore:false",
      "restore:true",
      "trash:false",
      "trash:true",
    ]);
  });
});
