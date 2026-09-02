import { expect } from "vitest";

import type {
  ConnectedObjectStorage,
  GetOptions,
  GetResult,
} from "../../runtime/slots.js";
import type { ContractCase } from "./case.js";
import { describeContract, drainKeys } from "./case.js";

export interface ObjectStorageContractOptions {
  /**
   * Bind a bucket for one case. Every case gets its own, so the returned
   * bucket must start empty and must not share objects with a previous one.
   */
  readonly connect: () =>
    ConnectedObjectStorage | Promise<ConnectedObjectStorage>;
  /**
   * The bucket is publicly addressable, so `url` resolves to a string. A
   * private bucket with no custom domain leaves this off: `url` then returns
   * `null` and the caller mints a proxied URL instead.
   */
  readonly publicUrls?: boolean;
  /** The bucket can mint presigned PUTs. Cases that need one are skipped without it. */
  readonly presign?: boolean;
}

type Case = ContractCase<ObjectStorageContractOptions>;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

async function getOrThrow(
  storage: ConnectedObjectStorage,
  key: string,
  opts?: GetOptions,
): Promise<GetResult> {
  const got = await storage.get(key, opts);
  if (!got) throw new Error(`object storage lost the object at "${key}"`);
  return got;
}

async function readText(
  storage: ConnectedObjectStorage,
  key: string,
): Promise<string> {
  const got = await getOrThrow(storage, key);
  return decoder.decode(new Uint8Array(await got.arrayBuffer()));
}

function drain(
  storage: ConnectedObjectStorage,
  opts: { readonly prefix?: string; readonly limit: number },
): Promise<string[]> {
  return drainKeys(async (cursor) => {
    const page = await storage.list(opts.prefix, { limit: opts.limit, cursor });
    return {
      keys: page.items.map((item) => item.key),
      cursor: page.cursor,
      complete: !page.truncated,
    };
  });
}

async function seed(
  options: ObjectStorageContractOptions,
  keys: readonly string[],
): Promise<ConnectedObjectStorage> {
  const storage = await options.connect();
  for (const key of keys) await storage.put(key, key);
  return storage;
}

/** Every case of the object-storage contract, for guard tests that run them outside vitest. */
export const objectStorageContractCases: readonly Case[] = [
  {
    name: "round-trips a string body with its content type",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("hello.txt", "world", { contentType: "text/plain" });
      const got = await getOrThrow(storage, "hello.txt");
      expect(got.size).toBe(5);
      expect(got.contentType).toBe("text/plain");
      expect(decoder.decode(new Uint8Array(await got.arrayBuffer()))).toBe(
        "world",
      );
    },
  },
  {
    name: "round-trips a byte body",
    run: async (options) => {
      const storage = await options.connect();
      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.put("binary", payload);
      const got = await getOrThrow(storage, "binary");
      expect(new Uint8Array(await got.arrayBuffer())).toEqual(payload);
    },
  },
  {
    name: "round-trips a multi-chunk stream body",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put(
        "chunks",
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.enqueue(new Uint8Array([3, 4]));
            controller.close();
          },
        }),
      );
      const got = await getOrThrow(storage, "chunks");
      expect(new Uint8Array(await got.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3, 4]),
      );
    },
  },
  {
    name: "round-trips an ArrayBuffer body",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("buffer", encoder.encode("held").buffer);
      expect(await readText(storage, "buffer")).toBe("held");
    },
  },
  {
    name: "round-trips a Blob body",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("blob", new Blob(["held"]));
      expect(await readText(storage, "blob")).toBe("held");
    },
  },
  {
    name: "a null body stores an empty object",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("empty", null);
      expect((await getOrThrow(storage, "empty")).size).toBe(0);
    },
  },
  {
    name: "get exposes the object as a readable stream",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("k", "streamed");
      const got = await getOrThrow(storage, "k");
      const streamed = await new Response(got.body).text();
      expect(streamed).toBe("streamed");
    },
  },
  {
    name: "get on a key that is not there returns null",
    run: async (options) => {
      const storage = await options.connect();
      expect(await storage.get("missing")).toBeNull();
    },
  },
  {
    name: "put overwrites the previous body",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("k", "first");
      await storage.put("k", "second");
      expect(await readText(storage, "k")).toBe("second");
    },
  },
  {
    name: "custom metadata round-trips",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("k", "v", { customMetadata: { owner: "alice" } });
      expect((await getOrThrow(storage, "k")).customMetadata).toEqual({
        owner: "alice",
      });
    },
  },
  {
    name: "the etag is stable for the same bytes and moves when they change",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("k", "abc");
      const first = (await getOrThrow(storage, "k")).etag;
      expect(first).toBeTypeOf("string");
      expect(first.length).toBeGreaterThan(0);
      await storage.put("k", "abc");
      expect((await getOrThrow(storage, "k")).etag).toBe(first);
      await storage.put("k", "abcd");
      expect((await getOrThrow(storage, "k")).etag).not.toBe(first);
    },
  },
  {
    name: "head reports size, content type and etag without the body",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("k", "world", {
        contentType: "text/plain",
        customMetadata: { owner: "alice" },
      });
      const head = await storage.head("k");
      expect(head?.size).toBe(5);
      expect(head?.contentType).toBe("text/plain");
      expect(head?.customMetadata).toEqual({ owner: "alice" });
      expect(head?.etag).toBe((await getOrThrow(storage, "k")).etag);
    },
  },
  {
    name: "head on a key that is not there returns null",
    run: async (options) => {
      const storage = await options.connect();
      expect(await storage.head("missing")).toBeNull();
    },
  },
  {
    name: "a range read returns just the requested window",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("k", encoder.encode("0123456789"));
      const got = await getOrThrow(storage, "k", {
        range: { offset: 2, length: 3 },
      });
      expect(decoder.decode(new Uint8Array(await got.arrayBuffer()))).toBe(
        "234",
      );
    },
  },
  {
    name: "delete removes the object",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("k", "v");
      await storage.delete("k");
      expect(await storage.get("k")).toBeNull();
    },
  },
  {
    name: "delete of an object that is not there resolves",
    run: async (options) => {
      const storage = await options.connect();
      await expect(storage.delete("missing")).resolves.toBeUndefined();
    },
  },
  {
    name: "list reports the stored objects with their size",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("a", "one");
      await storage.put("b", "two!");
      const out = await storage.list();
      expect(out.items.map((item) => item.key).sort()).toEqual(["a", "b"]);
      const listed = out.items.find((item) => item.key === "b");
      expect(listed?.size).toBe(4);
      // A manifest is built off these two; an adapter that leaves them blank
      // breaks its consumer rather than itself.
      expect(listed?.etag).toBeTypeOf("string");
      expect(listed?.etag.length).toBeGreaterThan(0);
      expect(listed?.uploaded).toBeInstanceOf(Date);
      expect(out.truncated).toBe(false);
      expect(out.cursor).toBeUndefined();
    },
  },
  {
    name: "list filters by prefix",
    run: async (options) => {
      const storage = await options.connect();
      await storage.put("media/1.jpg", "a");
      await storage.put("media/2.jpg", "b");
      await storage.put("docs/x.pdf", "c");
      const out = await storage.list("media/");
      expect(out.items.map((item) => item.key).sort()).toEqual([
        "media/1.jpg",
        "media/2.jpg",
      ]);
    },
  },
  {
    name: "limit is honoured as an upper bound on the page",
    run: async (options) => {
      const storage = await seed(options, ["a", "b", "c", "d"]);
      const out = await storage.list(undefined, { limit: 2 });
      // An upper bound, not an exact count: a backend is free to return fewer.
      expect(out.items.length).toBeGreaterThan(0);
      expect(out.items.length).toBeLessThanOrEqual(2);
    },
  },
  {
    name: "the cursor resumes the listing with every key seen exactly once",
    run: async (options) => {
      const written = ["k0", "k1", "k2", "k3", "k4"];
      const storage = await seed(options, written);
      expect(await drain(storage, { limit: 2 })).toEqual(written);
    },
  },
  {
    name: "prefix and cursor combine across pages",
    run: async (options) => {
      const storage = await seed(options, ["u/1", "u/2", "u/3", "x/1"]);
      expect(await drain(storage, { prefix: "u/", limit: 2 })).toEqual([
        "u/1",
        "u/2",
        "u/3",
      ]);
    },
  },
  {
    name: "url resolves to a public address, one per key",
    skip: (options) =>
      options.publicUrls ? null : "the factory declares no public URL base",
    run: async (options) => {
      const storage = await options.connect();
      const url = await storage.url("a/b.jpg");
      expect(url).toBeTypeOf("string");
      expect(url).not.toBe(await storage.url("a/c.jpg"));
    },
  },
  {
    name: "url resolves to null when the bucket has no public address",
    skip: (options) =>
      options.publicUrls ? "the factory declares a public URL base" : null,
    run: async (options) => {
      const storage = await options.connect();
      expect(await storage.url("a/b.jpg")).toBeNull();
    },
  },
  {
    name: "presignPut mints a PUT with the requested content type",
    skip: (options) =>
      options.presign ? null : "the factory declares no presignPut",
    run: async (options) => {
      const storage = await options.connect();
      if (!storage.presignPut) {
        throw new Error("the factory declares presign but the slot has none");
      }
      const expiresIn = 60;
      const now = Math.floor(Date.now() / 1000);
      const presigned = await storage.presignPut("upload/1", {
        contentType: "image/jpeg",
        expiresIn,
      });
      expect(presigned.method).toBe("PUT");
      expect(presigned.url).toBeTypeOf("string");
      expect(presigned.headers["content-type"]).toBe("image/jpeg");
      // Bounded both ways: unix seconds, and the window that was asked for.
      // An adapter answering in milliseconds clears a lower bound alone.
      expect(presigned.expiresAt).toBeGreaterThan(now);
      expect(presigned.expiresAt).toBeLessThanOrEqual(now + expiresIn + 5);
    },
  },
];

/**
 * Assert an implementation of the `storage:` slot satisfies its port. Call it
 * at the top level of a test file with a factory that binds a fresh bucket.
 */
export function describeObjectStorageContract(
  options: ObjectStorageContractOptions,
): void {
  describeContract(
    "object storage contract",
    objectStorageContractCases,
    options,
  );
}
