import { describe, expect, test } from "vitest";

import type { Mailer } from "../auth/mailer/types.js";
import type {
  AssetsBinding,
  ConnectedCache,
  ConnectedObjectStorage,
} from "../runtime/slots.js";
import { createTelemetryCollector } from "./collector.js";
import {
  traceAssets,
  traceCache,
  traceMailer,
  traceStorage,
} from "./traced-slots.js";

describe("traceCache", () => {
  function stub(hit?: Response): ConnectedCache {
    return {
      match: () => Promise.resolve(hit),
      put: () => Promise.resolve(),
      purgeTags: () => Promise.resolve(),
    };
  }

  test("match produces a `cache: match` span carrying the hit/miss outcome", async () => {
    const telemetry = createTelemetryCollector();
    const cache = traceCache(stub(new Response("hit")), () => telemetry);

    const result = await cache.match(new Request("https://cms.example/"));

    expect(await result?.text()).toBe("hit");
    const [span] = telemetry.getSpans();
    expect(span?.name).toBe("cache: match");
    expect(span?.attributes["cache.hit"]).toBe(true);
  });

  test("a miss stamps cache.hit false", async () => {
    const telemetry = createTelemetryCollector();
    const cache = traceCache(stub(), () => telemetry);

    await cache.match(new Request("https://cms.example/"));

    expect(telemetry.getSpans()[0]?.attributes["cache.hit"]).toBe(false);
  });

  test("put produces a `cache: put` span carrying the tags", async () => {
    const telemetry = createTelemetryCollector();
    const cache = traceCache(stub(), () => telemetry);

    await cache.put(new Request("https://cms.example/"), new Response("x"), [
      "t:post",
      "e:1",
    ]);

    const [span] = telemetry.getSpans();
    expect(span?.name).toBe("cache: put");
    expect(span?.attributes["cache.tags"]).toEqual(["t:post", "e:1"]);
  });

  test("purgeTags passes through unspanned — it runs post-response, outside the snapshot", async () => {
    const telemetry = createTelemetryCollector();
    const purged: (readonly string[])[] = [];
    const cache = traceCache(
      {
        ...stub(),
        purgeTags: (tags) => (purged.push(tags), Promise.resolve()),
      },
      () => telemetry,
    );

    await cache.purgeTags(["t:post"]);

    expect(purged).toEqual([["t:post"]]);
    expect(telemetry.getSpans()).toEqual([]);
  });
});

describe("traceAssets", () => {
  test("fetch produces an `assets: fetch` span with url and status", async () => {
    const telemetry = createTelemetryCollector();
    const binding: AssetsBinding = {
      fetch: () => Promise.resolve(new Response("asset", { status: 200 })),
    };
    const assets = traceAssets(binding, () => telemetry);

    const response = await assets.fetch(
      new Request("https://cms.example/_plumix/admin/chunk.js"),
    );

    expect(await response.text()).toBe("asset");
    const [span] = telemetry.getSpans();
    expect(span?.name).toBe("assets: fetch");
    expect(span?.attributes).toEqual({
      "url.full": "https://cms.example/_plumix/admin/chunk.js",
      "http.response.status_code": 200,
    });
  });
});

describe("traceStorage", () => {
  function stub(): ConnectedObjectStorage {
    return {
      put: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      head: () => Promise.resolve(null),
      delete: () => Promise.resolve(),
      list: () => Promise.resolve({ items: [], truncated: false }),
      url: () => Promise.resolve("https://cdn.example/k"),
    };
  }

  test("object I/O ops get `storage: <op>` spans keyed by object key", async () => {
    const telemetry = createTelemetryCollector();
    const storage = traceStorage(stub(), () => telemetry);

    await storage.put("media/a.png", "body");
    await storage.get("media/a.png");
    await storage.head("media/a.png");
    await storage.delete("media/a.png");

    const spans = telemetry.getSpans();
    expect(spans.map((s) => s.name)).toEqual([
      "storage: put",
      "storage: get",
      "storage: head",
      "storage: delete",
    ]);
    expect(
      spans.every((s) => s.attributes["storage.key"] === "media/a.png"),
    ).toBe(true);
  });

  test("list gets a `storage: list` span keyed by prefix", async () => {
    const telemetry = createTelemetryCollector();
    const storage = traceStorage(stub(), () => telemetry);

    await storage.list("media/");

    const [span] = telemetry.getSpans();
    expect(span?.name).toBe("storage: list");
    expect(span?.attributes["storage.prefix"]).toBe("media/");
  });

  test("url passes through unspanned — URL minting, not object I/O", async () => {
    const telemetry = createTelemetryCollector();
    const storage = traceStorage(stub(), () => telemetry);

    expect(await storage.url("media/a.png")).toBe("https://cdn.example/k");
    expect(telemetry.getSpans()).toEqual([]);
  });

  test("presignPut availability mirrors the underlying storage", () => {
    const telemetry = createTelemetryCollector();
    expect("presignPut" in traceStorage(stub(), () => telemetry)).toBe(false);

    const withPresign: ConnectedObjectStorage = {
      ...stub(),
      presignPut: () =>
        Promise.resolve({
          url: "https://bucket.example/a",
          method: "PUT" as const,
          headers: {},
          expiresAt: 0,
        }),
    };
    expect("presignPut" in traceStorage(withPresign, () => telemetry)).toBe(
      true,
    );
  });
});

describe("traceMailer", () => {
  test("send produces a `mailer: send` span carrying recipient and subject", async () => {
    const telemetry = createTelemetryCollector();
    const sent: string[] = [];
    const mailer: Mailer = {
      send: (m) => (sent.push(m.to), Promise.resolve()),
    };
    const traced = traceMailer(mailer, () => telemetry);

    await traced.send({
      to: "user@example.com",
      subject: "Sign in",
      text: "link",
    });

    expect(sent).toEqual(["user@example.com"]);
    const [span] = telemetry.getSpans();
    expect(span?.name).toBe("mailer: send");
    expect(span?.attributes).toEqual({
      "mail.to": "user@example.com",
      "mail.subject": "Sign in",
    });
  });

  test("a send failure marks the span as an error and rethrows", async () => {
    const telemetry = createTelemetryCollector();
    const mailer: Mailer = {
      send: () => Promise.reject(new Error("smtp down")),
    };
    const traced = traceMailer(mailer, () => telemetry);

    await expect(
      traced.send({ to: "u@example.com", subject: "s", text: "t" }),
    ).rejects.toThrow("smtp down");
    const [span] = telemetry.getSpans();
    expect(span?.status).toBe("error");
    expect(span?.error?.message).toBe("smtp down");
  });
});
