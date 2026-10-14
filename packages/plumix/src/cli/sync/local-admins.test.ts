import { describe, expect, test } from "vitest";

import type { DumpReader, SyncRow } from "@plumix/core";
import { memoryDump } from "@plumix/core/test";

import { keepLocalAdmins } from "./local-admins.js";

async function* rowsOf(rows: readonly SyncRow[]): AsyncIterable<SyncRow> {
  for (const row of rows) {
    await Promise.resolve();
    yield row;
  }
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}

async function remoteDump(
  users: readonly SyncRow[],
  credentials: readonly SyncRow[],
): Promise<DumpReader> {
  const dump = memoryDump({
    source: { origin: "https://example.com", basePath: "" },
    scopes: ["users", "content"],
    heads: { core: "1" },
  });
  await dump.writer.table("users", rowsOf(users));
  await dump.writer.table("credentials", rowsOf(credentials));
  await dump.writer.table("entries", rowsOf([]));
  return dump.read();
}

const LOCAL_ADMIN = {
  id: 1,
  email: "me@example.com",
  slug: "me",
  role: "admin",
  meta: "{}",
};
const LOCAL_PASSKEY = {
  id: "local-passkey",
  user_id: 1,
  public_key: new Uint8Array([1]),
};

describe("keepLocalAdmins", () => {
  test("a remote user with the local admin's email becomes an admin holding the local passkeys, not the remote ones", async () => {
    const dump = await remoteDump(
      [
        {
          id: 4,
          email: "other@example.com",
          slug: "other",
          role: "editor",
          meta: "{}",
        },
        {
          id: 9,
          email: "me@example.com",
          slug: "me-remote",
          role: "editor",
          meta: "{}",
        },
      ],
      [
        { id: "remote-passkey", user_id: 9, public_key: new Uint8Array([9]) },
        { id: "other-passkey", user_id: 4, public_key: new Uint8Array([4]) },
      ],
    );

    const kept = await keepLocalAdmins(dump, {
      users: [LOCAL_ADMIN],
      credentials: [LOCAL_PASSKEY],
    });

    expect(await collect(kept.rows("users"))).toEqual([
      {
        id: 4,
        email: "other@example.com",
        slug: "other",
        role: "editor",
        meta: "{}",
      },
      {
        id: 9,
        email: "me@example.com",
        slug: "me-remote",
        role: "admin",
        meta: "{}",
      },
    ]);
    expect(await collect(kept.rows("credentials"))).toEqual([
      { id: "other-passkey", user_id: 4, public_key: new Uint8Array([4]) },
      { id: "local-passkey", user_id: 9, public_key: new Uint8Array([1]) },
    ]);
  });

  test("a local admin the remote lacks is added under a free id, with a free slug, and their passkeys", async () => {
    const dump = await remoteDump(
      [
        {
          id: 3,
          email: "a@example.com",
          slug: "me",
          role: "editor",
          meta: "{}",
        },
        {
          id: 8,
          email: "b@example.com",
          slug: "me-2",
          role: "editor",
          meta: "{}",
        },
      ],
      [],
    );

    const kept = await keepLocalAdmins(dump, {
      users: [LOCAL_ADMIN],
      credentials: [LOCAL_PASSKEY],
    });

    expect((await collect(kept.rows("users"))).at(-1)).toEqual({
      id: 9,
      email: "me@example.com",
      slug: "me-3",
      role: "admin",
      meta: "{}",
    });
    expect(await collect(kept.rows("credentials"))).toEqual([
      { id: "local-passkey", user_id: 9, public_key: new Uint8Array([1]) },
    ]);
  });

  test("counts the rows it changed in the manifest and leaves other tables alone", async () => {
    const dump = await remoteDump([], []);

    const kept = await keepLocalAdmins(dump, {
      users: [LOCAL_ADMIN],
      credentials: [LOCAL_PASSKEY],
    });

    expect(kept.manifest.tables).toEqual([
      { name: "users", rows: 1 },
      { name: "credentials", rows: 1 },
      { name: "entries", rows: 0 },
    ]);
  });
});
