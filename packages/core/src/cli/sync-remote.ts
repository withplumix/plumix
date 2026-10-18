import * as v from "valibot";

import type {
  MigrationOwner,
  SyncEnd,
  SyncImportReport,
  SyncScope,
  SyncSettleReport,
} from "../context/runtime-adapter.js";
import { dumpWireStream, SYNC_WIRE_TYPE, writeWireInto } from "./sync-wire.js";
import { assertSameHeads, SyncError } from "./sync.js";

export interface RemoteSyncEndOptions {
  /**
   * The deployed site's origin, with any base path it is served under: the
   * `url` the CLI sets whenever the target is remote.
   */
  readonly url: string | undefined;
  /** Called once, on the first request. */
  readonly apiToken: () => Promise<string>;
  /** In application order, as `OpenSyncEndOptions` holds them. */
  readonly owners: readonly MigrationOwner[];
  /** `globalThis.fetch` unless given. */
  readonly fetch?: (input: string, init: RequestInit) => Promise<Response>;
}

const SYNC_PATH = "_plumix/api/v1/system/sync/";

const HeadsBody = v.object({
  heads: v.record(v.string(), v.nullable(v.string())),
});

const SnapshotBody = v.object({ id: v.string(), restoreHint: v.string() });

const MigrationsDifferBody = v.object({
  error: v.object({
    code: v.literal("sync_migrations_differ"),
    differences: v.array(v.string()),
  }),
});

function syncUrl(origin: string, action: string, query = ""): string {
  const root = origin.endsWith("/") ? origin : `${origin}/`;
  return new URL(`${SYNC_PATH}${action}${query}`, root).href;
}

function scopesQuery(scopes: readonly SyncScope[]): string {
  return scopes.map((scope) => scope.name).join(",");
}

function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | undefined;
  return () => (loaded ??= load());
}

/**
 * The deployed site, reached through its sync routes. Heads travel keyed by
 * tracking table, which is all the site can name them by.
 */
export function remoteSyncEnd(options: RemoteSyncEndOptions): SyncEnd {
  const { owners } = options;
  if (options.url === undefined) throw SyncError.remoteUrlMissing();
  const url = options.url;
  const send = options.fetch ?? ((input, init) => fetch(input, init));
  const token = once(options.apiToken);

  async function request(
    action: string,
    init: RequestInit & { readonly query?: string } = {},
  ): Promise<Response> {
    const { query, ...rest } = init;
    const target = syncUrl(url, action, query);
    const headers = new Headers(rest.headers);
    headers.set("authorization", `Bearer ${await token()}`);
    const response = await send(target, { ...rest, headers });
    if (response.ok) return response;
    const body = await response.text();
    const differs = parsed(MigrationsDifferBody, body);
    if (differs !== undefined) {
      throw SyncError.migrationsDiffer({
        differences: differs.error.differences,
      });
    }
    throw SyncError.remoteRefused({
      url: target,
      status: response.status,
      body,
    });
  }

  async function json<TSchema extends v.GenericSchema>(
    response: Response,
    schema: TSchema,
  ): Promise<v.InferOutput<TSchema>> {
    const text = await response.text();
    const body = parsed(schema, text);
    if (body === undefined) {
      throw SyncError.remoteRefused({
        url: response.url || url,
        status: response.status,
        body: text,
      });
    }
    return body;
  }

  async function heads(): Promise<Record<string, string | null>> {
    const body = await json(await request("heads"), HeadsBody);
    return Object.fromEntries(
      owners.map((owner) => [
        owner.name,
        body.heads[owner.migrationsTable] ?? null,
      ]),
    );
  }

  // The dump's heads as the site names them: by tracking table.
  function tableHeads(
    byOwner: Readonly<Record<string, string | null>>,
  ): Record<string, string | null> {
    return Object.fromEntries(
      owners.map((owner) => [
        owner.migrationsTable,
        byOwner[owner.name] ?? null,
      ]),
    );
  }

  const hints = new Map<string, string>();
  return {
    origin: url,
    heads,
    async exportData(scopes, into) {
      const response = await request("export", {
        query: `?scopes=${encodeURIComponent(scopesQuery(scopes))}`,
      });
      if (response.body === null) throw SyncError.dumpIncomplete();
      await writeWireInto(response.body, into);
    },
    async importData(from, scopes, { dryRun }) {
      assertSameHeads(
        { label: "the dump", heads: from.manifest.heads },
        { label: "remote", heads: await heads() },
      );
      const body = dumpWireStream(from, scopes, {
        ...from.manifest,
        heads: tableHeads(from.manifest.heads),
      });
      const init: RequestInit & { readonly duplex: "half" } = {
        method: "POST",
        headers: { "content-type": SYNC_WIRE_TYPE },
        body,
        duplex: "half",
      };
      const response = await request("import", {
        ...init,
        query: `?scopes=${encodeURIComponent(scopesQuery(scopes))}&dryRun=${String(dryRun)}`,
      });
      // Safety: the site answers with the report its own import returned.
      return (await response.json()) as SyncImportReport;
    },
    async snapshot() {
      const response = await request("snapshot", { method: "POST" });
      const { id, restoreHint } = await json(response, SnapshotBody);
      hints.set(id, restoreHint);
      return { id };
    },
    restoreHint: (snapshot) =>
      hints.get(snapshot.id) ??
      `Restore the snapshot ${snapshot.id} on the server.`,
    async settle(event) {
      const response = await request("settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
      // Safety: the site answers with `settleSync`'s report.
      return (await response.json()) as SyncSettleReport;
    },
    close: () => Promise.resolve(),
  };
}

function parsed<TSchema extends v.GenericSchema>(
  schema: TSchema,
  text: string,
): v.InferOutput<TSchema> | undefined {
  try {
    const result = v.safeParse(schema, JSON.parse(text) as unknown);
    return result.success ? result.output : undefined;
  } catch {
    return undefined;
  }
}
