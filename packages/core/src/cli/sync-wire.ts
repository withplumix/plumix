import * as v from "valibot";

import type {
  DumpManifest,
  DumpReader,
  DumpWriter,
  SyncObject,
  SyncScope,
} from "../context/runtime-adapter.js";
import type { SyncRow, SyncValue } from "../runtime/contract/slots.js";
import { SyncError } from "./sync.js";

/**
 * One JSON value per line, in the order an import reads them, ending in
 * `{"end":true}` so a stream cut short is told from a whole one.
 */
export const SYNC_WIRE_TYPE = "application/x-ndjson";

/** Below `String.fromCharCode`'s argument limit on every engine. */
const BASE64_SLICE = 0x8000;

/** An object's bytes travel in lines of at most this many. */
const CHUNK_BYTES = 48 * 1024;

const WireValueSchema = v.union([
  v.string(),
  v.number(),
  v.null(),
  v.object({ $blob: v.string() }),
]);

type WireValue = v.InferOutput<typeof WireValueSchema>;

const ManifestSchema = v.object({
  format: v.literal(1),
  source: v.object({ origin: v.string(), basePath: v.string() }),
  scopes: v.array(v.string()),
  tables: v.array(v.object({ name: v.string(), rows: v.number() })),
  authors: v.number(),
  objects: v.number(),
  heads: v.record(v.string(), v.nullable(v.string())),
});

const WireLineSchema = v.union([
  v.object({
    header: v.object({
      manifest: ManifestSchema,
      /** Each scope's tables, where the caller narrows the ones it names. */
      tables: v.record(v.string(), v.array(v.string())),
    }),
  }),
  v.object({ section: v.literal("table"), name: v.string() }),
  v.object({ section: v.picklist(["authors", "objects"]) }),
  v.object({ row: v.record(v.string(), WireValueSchema) }),
  v.object({ object: v.string(), contentType: v.optional(v.string()) }),
  v.object({ chunk: v.string() }),
  v.object({ end: v.literal(true) }),
]);

type WireLine = v.InferOutput<typeof WireLineSchema>;

/** What an import body opens with. */
export type WireHeader = Extract<WireLine, { header: unknown }>["header"];

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += BASE64_SLICE) {
    binary += String.fromCharCode(
      ...bytes.subarray(start, start + BASE64_SLICE),
    );
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeRow(row: SyncRow): Record<string, WireValue> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      value instanceof Uint8Array ? { $blob: toBase64(value) } : value,
    ]),
  );
}

function decodeRow(row: Readonly<Record<string, WireValue>>): SyncRow {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]): [string, SyncValue] => [
      column,
      value !== null && typeof value === "object"
        ? fromBase64(value.$blob)
        : value,
    ]),
  );
}

type WriteLine = (line: WireLine) => Promise<void>;

interface LineWriter extends DumpWriter {
  /** Opens the objects section, which the first object opens otherwise. */
  objectsSection(): Promise<void>;
}

/** A dump writer that streams each call as lines. */
function lineWriter(write: WriteLine): LineWriter {
  let objects = false;
  async function objectsSection(): Promise<void> {
    if (!objects) await write({ section: "objects" });
    objects = true;
  }
  async function rowsOf(rows: AsyncIterable<SyncRow>): Promise<void> {
    for await (const row of rows) await write({ row: encodeRow(row) });
  }
  return {
    async table(name, rows) {
      await write({ section: "table", name });
      await rowsOf(rows);
    },
    async authors(rows) {
      await write({ section: "authors" });
      await rowsOf(rows);
    },
    objectsSection,
    async object(key, body, contentType) {
      await objectsSection();
      await write({
        object: key,
        ...(contentType !== undefined && { contentType }),
      });
      for await (const bytes of body) {
        for (let start = 0; start < bytes.length; start += CHUNK_BYTES) {
          await write({
            chunk: toBase64(bytes.subarray(start, start + CHUNK_BYTES)),
          });
        }
      }
    },
  };
}

/**
 * Runs `produce` against a writer whose lines become the returned stream; a
 * throw aborts the stream, so the reader never sees `end`.
 */
export function wireStream(
  produce: (write: WriteLine, writer: LineWriter) => Promise<void>,
): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const sink = writable.getWriter();
  const encoder = new TextEncoder();
  const write: WriteLine = async (line) => {
    await sink.ready;
    await sink.write(encoder.encode(`${JSON.stringify(line)}\n`));
  };
  void (async () => {
    try {
      await produce(write, lineWriter(write));
      await write({ end: true });
      await sink.close();
    } catch (error) {
      await sink.abort(error);
    }
  })();
  return readable;
}

/**
 * An import body: the header, the authors, each scope's tables in load order,
 * then `media`'s objects, the order an import reads them in.
 */
export function dumpWireStream(
  from: DumpReader,
  scopes: readonly SyncScope[],
  manifest: DumpManifest,
): ReadableStream<Uint8Array> {
  return wireStream(async (write, writer) => {
    await write({
      header: {
        manifest: {
          ...manifest,
          scopes: [...manifest.scopes],
          tables: [...manifest.tables],
        },
        tables: Object.fromEntries(
          scopes.map((scope) => [
            scope.name,
            scope.tables.map((table) => table.table),
          ]),
        ),
      },
    });
    await writer.authors(from.authors());
    for (const table of scopes.flatMap((scope) => scope.tables)) {
      await writer.table(table.table, from.rows(table.table));
    }
    if (!scopes.some((scope) => scope.name === "media")) return;
    await writer.objectsSection();
    for await (const object of from.objects()) {
      await writer.object(object.key, object.body, object.contentType);
    }
  });
}

async function* textLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending = "";
  for await (const bytes of body) {
    pending += decoder.decode(bytes, { stream: true });
    let newline = pending.indexOf("\n");
    while (newline !== -1) {
      yield pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
  }
  pending += decoder.decode();
  if (pending !== "") yield pending;
}

function parseLine(text: string): WireLine {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw SyncError.dumpMalformed();
  }
  const parsed = v.safeParse(WireLineSchema, value);
  if (!parsed.success) throw SyncError.dumpMalformed();
  return parsed.output;
}

/** Reads the lines in order, one ahead, so a section ends where the next starts. */
class WireReader {
  readonly #lines: AsyncGenerator<string>;
  #peeked: WireLine | null | undefined;

  constructor(body: ReadableStream<Uint8Array>) {
    this.#lines = textLines(body);
  }

  /** `null` once the stream has ended. */
  async peek(): Promise<WireLine | null> {
    if (this.#peeked === undefined) {
      const next = await this.#lines.next();
      this.#peeked = next.done === true ? null : parseLine(next.value);
    }
    return this.#peeked;
  }

  async next(): Promise<WireLine | null> {
    const line = await this.peek();
    if (line !== null) this.#peeked = undefined;
    return line;
  }

  /** The next line, which must be there: a stream without `end` is cut short. */
  async required(): Promise<WireLine> {
    const line = await this.next();
    if (line === null) throw SyncError.dumpIncomplete();
    return line;
  }

  async *rows(): AsyncIterable<SyncRow> {
    for (;;) {
      const line = await this.peek();
      if (line === null || !("row" in line)) return;
      await this.next();
      yield decodeRow(line.row);
    }
  }

  async skipRows(): Promise<void> {
    for await (const row of this.rows()) void row;
  }

  chunks(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        const line = await this.peek();
        if (line === null || !("chunk" in line)) {
          controller.close();
          return;
        }
        await this.next();
        controller.enqueue(fromBase64(line.chunk));
      },
    });
  }

  async skipChunks(): Promise<void> {
    for (;;) {
      const line = await this.peek();
      if (line === null || !("chunk" in line)) return;
      await this.next();
    }
  }

  /** Reads forward to the section; one already passed is never found. */
  async seek(matches: (line: WireLine) => boolean): Promise<void> {
    for (;;) {
      const line = await this.required();
      if ("end" in line) throw SyncError.dumpIncomplete();
      if (matches(line)) return;
    }
  }

  async *objects(): AsyncIterable<SyncObject> {
    for (;;) {
      await this.skipChunks();
      const line = await this.peek();
      if (line === null || !("object" in line)) return;
      await this.next();
      yield {
        key: line.object,
        body: this.chunks(),
        ...(line.contentType !== undefined && {
          contentType: line.contentType,
        }),
      };
    }
  }

  /** Reads to the last line; throws when the stream ends before it. */
  async finish(): Promise<void> {
    for (;;) {
      const line = await this.required();
      if ("end" in line) return;
    }
  }
}

export interface WireDump {
  readonly reader: DumpReader;
  /** Each scope's tables, as the caller sent them. */
  readonly tables: Readonly<Record<string, readonly string[]>>;
  /** Resolves once the body's last line is read; throws if it never comes. */
  finish(): Promise<void>;
}

/**
 * An import body read once, front to back: each section must be asked for in
 * the order {@link dumpWireStream} writes them.
 */
export async function readWireDump(
  body: ReadableStream<Uint8Array>,
): Promise<WireDump> {
  const wire = new WireReader(body);
  const first = await wire.required();
  if (!("header" in first)) throw SyncError.dumpMalformed();
  const { manifest, tables } = first.header;
  const reader: DumpReader = {
    manifest,
    async *rows(table) {
      await wire.seek(
        (line) =>
          "section" in line && line.section === "table" && line.name === table,
      );
      yield* wire.rows();
    },
    async *authors() {
      await wire.seek(
        (line) => "section" in line && line.section === "authors",
      );
      yield* wire.rows();
    },
    async *objects() {
      await wire.seek(
        (line) => "section" in line && line.section === "objects",
      );
      yield* wire.objects();
    },
  };
  return { reader, tables, finish: () => wire.finish() };
}

/** Hands an exported stream to the writer, section by section. */
export async function writeWireInto(
  body: ReadableStream<Uint8Array>,
  into: DumpWriter,
): Promise<void> {
  const wire = new WireReader(body);
  for (;;) {
    const line = await wire.required();
    if ("end" in line) return;
    if (!("section" in line)) throw SyncError.dumpMalformed();
    if (line.section === "table") {
      await into.table(line.name, wire.rows());
      await wire.skipRows();
    } else if (line.section === "authors") {
      await into.authors(wire.rows());
      await wire.skipRows();
    } else {
      for await (const object of wire.objects()) {
        await into.object(object.key, object.body, object.contentType);
      }
    }
  }
}
