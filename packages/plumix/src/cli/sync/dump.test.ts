import {
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { DumpReader, SyncRow } from "@plumix/core";

import { readDump, writeDump } from "./dump.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-dump-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const HEADER = {
  source: { origin: "https://example.com", basePath: "" },
  scopes: ["users", "content", "media"],
  heads: { core: "1700000000000", "@acme/plugin": null },
};

async function* rowsOf(rows: readonly SyncRow[]): AsyncIterable<SyncRow> {
  for (const row of rows) {
    await Promise.resolve();
    yield row;
  }
}

function bodyOf(text: string): ReadableStream<Uint8Array> {
  return new Response(text).body as ReadableStream<Uint8Array>;
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}

async function writeSample(): Promise<void> {
  const writer = writeDump(dir, HEADER);
  await writer.table(
    "users",
    rowsOf([{ id: 1, email: "alice@example.com", name: null }]),
  );
  await writer.table(
    "credentials",
    rowsOf([
      { id: "cred", user_id: 1, public_key: new Uint8Array([0, 1, 254, 255]) },
    ]),
  );
  await writer.authors(rowsOf([]));
  await writer.object(
    "media/2026/a photo.png",
    bodyOf("png bytes"),
    "image/png",
  );
  await writer.finish();
}

function rewriteManifest(
  change: (manifest: Record<string, unknown>) => void,
): void {
  const path = join(dir, "manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<
    string,
    unknown
  >;
  change(manifest);
  writeFileSync(path, JSON.stringify(manifest));
}

describe("a sync dump", () => {
  test("reads back every row it wrote, a BLOB included, in order", async () => {
    await writeSample();

    const dump: DumpReader = await readDump(dir);

    expect(await collect(dump.rows("users"))).toEqual([
      { id: 1, email: "alice@example.com", name: null },
    ]);
    expect(await collect(dump.rows("credentials"))).toEqual([
      { id: "cred", user_id: 1, public_key: new Uint8Array([0, 1, 254, 255]) },
    ]);
  });

  test("writes a BLOB as base64 under $blob", async () => {
    await writeSample();

    expect(readFileSync(join(dir, "credentials.ndjson"), "utf8")).toBe(
      '{"id":"cred","user_id":1,"public_key":{"$blob":"AAH+/w=="}}\n',
    );
  });

  test("records the source, scopes, heads and every count in the manifest", async () => {
    await writeSample();

    const dump = await readDump(dir);

    expect(dump.manifest).toEqual({
      format: 1,
      source: { origin: "https://example.com", basePath: "" },
      scopes: ["users", "content", "media"],
      tables: [
        { name: "users", rows: 1 },
        { name: "credentials", rows: 1 },
      ],
      authors: 0,
      objects: 1,
      heads: { core: "1700000000000", "@acme/plugin": null },
    });
  });

  test("stores an object under a numbered file, never its key, and reads it back", async () => {
    await writeSample();

    const dump = await readDump(dir);
    const [object] = await collect(dump.objects());

    expect(readFileSync(join(dir, "objects/index.ndjson"), "utf8")).toBe(
      '{"key":"media/2026/a photo.png","file":"1","contentType":"image/png","size":9}\n',
    );
    expect(object?.key).toBe("media/2026/a photo.png");
    expect(object?.contentType).toBe("image/png");
    expect(await new Response(object?.body).text()).toBe("png bytes");
  });

  test("an unknown format version is invalid, naming the manifest", async () => {
    await writeSample();
    rewriteManifest((manifest) => {
      manifest.format = 2;
    });

    await expect(readDump(dir)).rejects.toMatchObject({
      code: "sync_dump_invalid",
      message: expect.stringContaining("manifest.json") as unknown,
    });
  });

  test("a malformed manifest is invalid", async () => {
    await writeSample();
    writeFileSync(join(dir, "manifest.json"), "{ not json");

    await expect(readDump(dir)).rejects.toMatchObject({
      code: "sync_dump_invalid",
      message: expect.stringContaining("manifest.json") as unknown,
    });
  });

  test("a missing table file is invalid, naming it", async () => {
    await writeSample();
    unlinkSync(join(dir, "credentials.ndjson"));

    await expect(readDump(dir)).rejects.toMatchObject({
      code: "sync_dump_invalid",
      message: expect.stringContaining("credentials.ndjson") as unknown,
    });
  });

  test("a row count that disagrees with the manifest is invalid, naming the file", async () => {
    await writeSample();
    rewriteManifest((manifest) => {
      manifest.tables = [
        { name: "users", rows: 2 },
        { name: "credentials", rows: 1 },
      ];
    });

    await expect(readDump(dir)).rejects.toMatchObject({
      code: "sync_dump_invalid",
      message: expect.stringContaining("users.ndjson") as unknown,
    });
  });

  test("a corrupt object index is invalid, naming it", async () => {
    await writeSample();
    writeFileSync(join(dir, "objects/index.ndjson"), "{ not json\n");

    await expect(readDump(dir)).rejects.toMatchObject({
      code: "sync_dump_invalid",
      message: expect.stringContaining("objects/index.ndjson") as unknown,
    });
  });

  test("a table name that would leave the dump is invalid", async () => {
    await writeSample();
    rewriteManifest((manifest) => {
      manifest.tables = [{ name: "../users", rows: 1 }];
    });

    await expect(readDump(dir)).rejects.toMatchObject({
      code: "sync_dump_invalid",
    });
  });
});
