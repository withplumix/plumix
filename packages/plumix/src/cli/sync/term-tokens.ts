import { getTableName } from "drizzle-orm";

import type {
  DumpReader,
  DumpWriter,
  SyncEnd,
  SyncRow,
  SyncScope,
} from "@plumix/core";
import { terms } from "@plumix/core/schema";

const TERMS = getTableName(terms);
const VERSION = terms.version.name;

const TERM_TOKENS_SCOPE: SyncScope = {
  name: "content",
  tables: [{ table: TERMS }],
};

/** Each term the target holds now, by id, with its `version`. */
async function heldVersions(end: SyncEnd): Promise<Map<number, number>> {
  const held = new Map<number, number>();
  const writer: DumpWriter = {
    async table(name, rows) {
      // A remote end exports the whole scope by name, not only `terms`.
      for await (const row of rows) {
        if (name === TERMS) {
          held.set(Number(row.id), Number(row[VERSION] ?? 0));
        }
      }
    },
    async authors(rows) {
      for await (const _row of rows) {
        // Drained: only the terms are read.
      }
    },
    async object(_key, body) {
      await body.cancel();
    },
  };
  await end.exportData([TERM_TOKENS_SCOPE], writer);
  return held;
}

/**
 * A replaced term is a system write (ADR 0048): its token moves past the
 * target's, so an editor's copy from before the load conflicts, not overwrites.
 */
export async function pastTargetTermTokens(
  dump: DumpReader,
  target: SyncEnd,
): Promise<DumpReader> {
  if (!dump.manifest.tables.some((table) => table.name === TERMS)) return dump;
  const held = await heldVersions(target);

  async function* termRows(): AsyncIterable<SyncRow> {
    for await (const row of dump.rows(TERMS)) {
      const version = held.get(Number(row.id));
      if (version === undefined) {
        yield row;
        continue;
      }
      yield {
        ...row,
        [VERSION]: Math.max(Number(row[VERSION] ?? 0), version + 1),
      };
    }
  }

  return {
    manifest: dump.manifest,
    rows: (table) => (table === TERMS ? termRows() : dump.rows(table)),
    authors: () => dump.authors(),
    objects: () => dump.objects(),
  };
}
