import type {
  DumpManifest,
  DumpReader,
  DumpWriter,
  SyncObject,
  SyncRow,
} from "../../context/runtime-adapter.js";

/** What the writer can't count itself: who exported, and in what state. */
export type MemoryDumpHeader = Pick<
  DumpManifest,
  "source" | "scopes" | "heads"
>;

export interface MemoryDump {
  readonly writer: DumpWriter;
  /** A reader over what the writer has taken so far; read it as often as you like. */
  read(): DumpReader;
}

interface StoredObject {
  readonly key: string;
  readonly contentType?: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

export async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}

export async function* iterate<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) {
    await Promise.resolve();
    yield item;
  }
}

function streamOf(bytes: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array> {
  return new Response(bytes).body ?? new ReadableStream();
}

/** A dump held in memory, for a transport's own tests and the sync contract. */
export function memoryDump(header: MemoryDumpHeader): MemoryDump {
  const tables = new Map<string, SyncRow[]>();
  let authors: SyncRow[] = [];
  const objects: StoredObject[] = [];
  const writer: DumpWriter = {
    async table(name, rows) {
      tables.set(name, await collect(rows));
    },
    async authors(rows) {
      authors = await collect(rows);
    },
    async object(key, body, contentType) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      objects.push({ key, bytes, ...(contentType && { contentType }) });
    },
  };
  return {
    writer,
    read() {
      const manifest: DumpManifest = {
        format: 1,
        ...header,
        tables: [...tables].map(([name, rows]) => ({
          name,
          rows: rows.length,
        })),
        authors: authors.length,
        objects: objects.length,
      };
      return {
        manifest,
        rows: (table) => iterate(tables.get(table) ?? []),
        authors: () => iterate(authors),
        objects: () =>
          iterate(
            objects.map(({ key, contentType, bytes }): SyncObject => ({
              key,
              body: streamOf(bytes),
              ...(contentType && { contentType }),
            })),
          ),
      };
    },
  };
}
