import type {
  DumpReader,
  DumpWriter,
  SyncEnd,
  SyncRow,
  SyncScope,
} from "@plumix/core";

/** The local admins a pull of `users` keeps, with their passkeys. */
export interface LocalAdmins {
  readonly users: readonly SyncRow[];
  readonly credentials: readonly SyncRow[];
}

const LOCAL_ADMINS_SCOPE: SyncScope = {
  name: "users",
  tables: [
    { table: "users", where: "role = 'admin'" },
    {
      table: "credentials",
      where: "user_id IN (SELECT id FROM users WHERE role = 'admin')",
    },
  ],
};

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}

async function* iterate<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) {
    await Promise.resolve();
    yield item;
  }
}

/** Reads the local end's admins and their passkeys; they are few. */
export async function exportLocalAdmins(end: SyncEnd): Promise<LocalAdmins> {
  const tables = new Map<string, SyncRow[]>();
  const writer: DumpWriter = {
    async table(name, rows) {
      tables.set(name, await collect(rows));
    },
    async authors(rows) {
      await collect(rows);
    },
    async object(_key, body) {
      await body.cancel();
    },
  };
  await end.exportData([LOCAL_ADMINS_SCOPE], writer);
  return {
    users: tables.get("users") ?? [],
    credentials: tables.get("credentials") ?? [],
  };
}

function freeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${String(suffix)}`)) suffix += 1;
  return `${base}-${String(suffix)}`;
}

/**
 * A remote passkey is bound to the remote origin's relying party, so the
 * matched user keeps the local admin's passkeys instead of their own.
 */
export async function keepLocalAdmins(
  dump: DumpReader,
  admins: LocalAdmins,
): Promise<DumpReader> {
  const users = await collect(dump.rows("users"));
  const credentials = await collect(dump.rows("credentials"));
  const slugs = new Set(users.map((user) => String(user.slug)));
  let nextId = Math.max(0, ...users.map((user) => Number(user.id))) + 1;
  const dropFrom = new Set<number>();
  const kept: SyncRow[] = [];
  for (const admin of admins.users) {
    const passkeys = admins.credentials.filter(
      (credential) => credential.user_id === admin.id,
    );
    const index = users.findIndex((user) => user.email === admin.email);
    const match = users[index];
    let userId: number;
    if (match === undefined) {
      userId = nextId;
      nextId += 1;
      const slug = freeSlug(String(admin.slug), slugs);
      slugs.add(slug);
      users.push({ ...admin, id: userId, slug });
    } else {
      userId = Number(match.id);
      users[index] = { ...match, role: "admin" };
      dropFrom.add(userId);
    }
    kept.push(...passkeys.map((passkey) => ({ ...passkey, user_id: userId })));
  }
  const keptIds = new Set(kept.map((passkey) => passkey.id));
  const remaining = credentials.filter(
    (credential) =>
      !dropFrom.has(Number(credential.user_id)) && !keptIds.has(credential.id),
  );
  const replaced = new Map<string, readonly SyncRow[]>([
    ["users", users],
    ["credentials", [...remaining, ...kept]],
  ]);
  return {
    manifest: {
      ...dump.manifest,
      tables: dump.manifest.tables.map((table) => ({
        name: table.name,
        rows: replaced.get(table.name)?.length ?? table.rows,
      })),
    },
    rows: (table) => {
      const rows = replaced.get(table);
      return rows === undefined ? dump.rows(table) : iterate(rows);
    },
    authors: () => dump.authors(),
    objects: () => dump.objects(),
  };
}
