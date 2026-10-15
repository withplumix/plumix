import { describe, expect, test } from "vitest";

import type { DumpReader, SyncRow } from "@plumix/core";
import { memoryDump } from "@plumix/core/test";

import { rewriteUrls } from "./rewrite-urls.js";

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

async function prodDump(rows: readonly SyncRow[]): Promise<DumpReader> {
  const dump = memoryDump({
    source: { origin: "https://prod.example", basePath: "" },
    scopes: ["content"],
    heads: { core: "1" },
  });
  await dump.writer.table("entries", rowsOf(rows));
  return dump.read();
}

const LOCAL = { origin: "http://localhost:5173", basePath: "" };

describe("rewriteUrls", () => {
  test.each([
    ["a host the source's is a prefix of", "https://prod.example.com/a"],
    ["another port", "https://prod.example:8080/a"],
    ["another scheme", "http://prod.example/a"],
    ["a relative URL", "/a"],
    ["a longer scheme", "xhttps://prod.example/a"],
  ])("leaves %s alone", async (_case, url) => {
    const content = JSON.stringify({ url });
    const dump = await prodDump([{ id: 1, content }]);

    const { dump: rewritten } = rewriteUrls(dump, LOCAL);

    expect(await collect(rewritten.rows("entries"))).toEqual([
      { id: 1, content },
    ]);
  });

  test("rewrites each of the source's URLs inside a longer string", async () => {
    const dump = await prodDump([
      {
        id: 1,
        content:
          '{"html":"<a href=\\"https://prod.example/a\\">a</a> <img srcset=\\"https://prod.example/b.jpg 2x\\">"}',
      },
    ]);

    const { dump: rewritten } = rewriteUrls(dump, LOCAL);

    expect(await collect(rewritten.rows("entries"))).toEqual([
      {
        id: 1,
        content:
          '{"html":"<a href=\\"http://localhost:5173/a\\">a</a> <img srcset=\\"http://localhost:5173/b.jpg 2x\\">"}',
      },
    ]);
  });

  test("leaves a column not declared as JSON alone, though its text parses as JSON", async () => {
    const dump = await prodDump([
      { id: 1, excerpt: '["https://prod.example/a"]', content: null },
    ]);

    const { dump: rewritten } = rewriteUrls(dump, LOCAL);

    expect(await collect(rewritten.rows("entries"))).toEqual([
      { id: 1, excerpt: '["https://prod.example/a"]', content: null },
    ]);
  });

  test("leaves JSON object keys alone", async () => {
    const content = '{"https://prod.example/a":1}';
    const dump = await prodDump([{ id: 1, content }]);

    const { dump: rewritten } = rewriteUrls(dump, LOCAL);

    expect(await collect(rewritten.rows("entries"))).toEqual([
      { id: 1, content },
    ]);
  });

  test("counts a table's rewritten values once, however often it is read", async () => {
    const dump = await prodDump([
      {
        id: 1,
        meta: '{"a":"https://prod.example/a","b":"https://prod.example/b"}',
      },
    ]);
    const { dump: rewritten, rewritten: counts } = rewriteUrls(dump, LOCAL);
    await collect(rewritten.rows("entries"));

    await collect(rewritten.rows("entries"));

    expect(counts()).toEqual(new Map([["entries", 2]]));
  });
});

describe("rewriteUrls, beyond the content tables", () => {
  test("leaves a plugin table's JSON column alone", async () => {
    const source = memoryDump({
      source: { origin: "https://prod.example", basePath: "" },
      scopes: ["plugin:forms"],
      heads: { core: "1" },
    });
    await source.writer.table(
      "forms",
      rowsOf([{ id: 1, fields: '{"action":"https://prod.example/send"}' }]),
    );

    const { dump: rewritten } = rewriteUrls(source.read(), LOCAL);

    expect(await collect(rewritten.rows("forms"))).toEqual([
      { id: 1, fields: '{"action":"https://prod.example/send"}' },
    ]);
  });
});
