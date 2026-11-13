import { afterEach, describe, expect, test } from "vitest";

import type { EditLeaseApi } from "@plumix/core/admin";
import { createEditingCopy } from "@plumix/core/admin";

import type { EntryRow, EntryWrite } from "./entry-autosave.js";
import type { EntryCopyCause } from "./entry-copy.js";
import { entryCopy } from "./entry-copy.js";

const ME = { id: 1, name: "Me" };
const T0 = new Date("2026-05-20T00:00:00.000Z");

function row(etag: string): EntryRow {
  return {
    id: 1,
    type: "post",
    parentId: null,
    title: "Hello",
    slug: "hello",
    content: null,
    excerpt: null,
    status: "draft",
    authorId: 1,
    sortOrder: 0,
    publishedAt: null,
    createdAt: T0,
    updatedAt: T0,
    meta: {},
    etag,
  };
}

/** The entry's lease, held by the signed-in user; a take over is refused. */
function leaseRefusingTakeOver(refusal: Error): EditLeaseApi {
  return {
    acquire: ({ takeOver }) =>
      takeOver
        ? Promise.reject(refusal)
        : Promise.resolve({
            holder: ME,
            surface: "admin",
            since: T0,
            expiresAt: new Date("2026-05-20T00:02:00.000Z"),
          }),
    renew: () => Promise.reject(new Error("no renewal in these tests")),
    release: () => Promise.resolve(),
  };
}

const opened: { dispose: () => void }[] = [];

afterEach(() => {
  for (const copy of opened.splice(0)) copy.dispose();
});

/**
 * An entry's editing copy wired through `entryCopy`, with each failure the
 * listening editor is told kept as `[message, cause]`.
 */
function openCopy(options: {
  readonly write?: (ifMatch: string, work: EntryWrite) => Promise<EntryRow>;
  readonly reload?: () => Promise<string>;
  readonly takeOverRefusal?: Error;
}) {
  const failures: [string, EntryCopyCause][] = [];
  const wires = entryCopy({
    write: options.write ?? (() => Promise.resolve(row("e1"))),
    reload: options.reload ?? (() => Promise.resolve("reloaded")),
  });
  wires.listen({
    wrote: () => undefined,
    failed: (err, cause) => failures.push([(err as Error).message, cause]),
    discard: () => undefined,
  });
  const copy = createEditingCopy<number, EntryWrite, unknown, EntryRow>({
    id: 1,
    lease: leaseRefusingTakeOver(
      options.takeOverRefusal ?? new Error("no take over"),
    ),
    etag: "e0",
    userId: ME.id,
    readSaved: () => Promise.resolve(undefined),
    save: wires.save,
    reload: wires.reload,
    onFailed: wires.onFailed,
  });
  opened.push(copy);
  return { copy, failures };
}

describe("entryCopy", () => {
  test("a write that fails is told as that write", async () => {
    const { copy, failures } = openCopy({
      write: () => Promise.reject(new Error("refused publish")),
    });

    await copy.save({ kind: "publish" });

    expect(failures).toEqual([["refused publish", { kind: "publish" }]]);
  });

  test("a take over that fails after a failed publish is told as a take over", async () => {
    const { copy, failures } = openCopy({
      write: () => Promise.reject(new Error("refused publish")),
      takeOverRefusal: new Error("lease unavailable"),
    });
    await copy.save({ kind: "publish" });

    await copy.takeOver();

    expect(failures).toEqual([
      ["refused publish", { kind: "publish" }],
      ["lease unavailable", "takeOver"],
    ]);
  });

  test("a reload that fails is told as a reload, not as the write before it", async () => {
    const { copy, failures } = openCopy({
      write: () => Promise.reject(new Error("refused update")),
      reload: () => Promise.reject(new Error("offline")),
    });
    await copy.save({ kind: "update", patch: { title: "Mine" } });

    await copy.loadTheirs();

    expect(failures).toEqual([
      ["refused update", { kind: "update", patch: { title: "Mine" } }],
      ["offline", "reload"],
    ]);
  });
});
