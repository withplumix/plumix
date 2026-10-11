import { describe, expect, test } from "vitest";

import { createJsonLogger } from "./json-logger.js";

const TIME = new Date("2026-10-11T09:30:00.000Z");

function capture() {
  const lines: string[] = [];
  const logger = createJsonLogger(
    (line) => lines.push(line),
    () => TIME,
  );
  return { logger, lines };
}

describe("createJsonLogger", () => {
  test("writes one JSON object per call with its level, message, time and meta", () => {
    const { logger, lines } = capture();

    logger.info("cache_purged", { tags: ["entry:1"] });

    expect(lines).toEqual([
      `{"level":"info","message":"cache_purged","time":"2026-10-11T09:30:00.000Z","tags":["entry:1"]}\n`,
    ]);
  });

  test("a call without meta is a record of level, message and time alone", () => {
    const { logger, lines } = capture();

    logger.warn("slow_query");

    expect(lines).toEqual([
      `{"level":"warn","message":"slow_query","time":"2026-10-11T09:30:00.000Z"}\n`,
    ]);
  });

  test("serializes an error in the meta with its name, message and stack", () => {
    const { logger, lines } = capture();
    const error = new TypeError("boom");

    logger.error("dispatch_failed", { error, path: "/blog" });

    expect(lines.map((line) => JSON.parse(line) as unknown)).toMatchObject([
      {
        level: "error",
        path: "/blog",
        error: { name: "TypeError", message: "boom", stack: error.stack },
      },
    ]);
  });

  test("meta cannot overwrite the record's level, message or time", () => {
    const { logger, lines } = capture();

    logger.error("dispatch_failed", {
      level: "info",
      message: "other",
      time: 0,
    });

    expect(lines).toEqual([
      `{"level":"error","message":"dispatch_failed","time":"2026-10-11T09:30:00.000Z"}\n`,
    ]);
  });

  test("meta that JSON cannot hold still yields one parseable line", () => {
    const { logger, lines } = capture();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    logger.error("dispatch_failed", { cyclic });

    expect(lines.map((line) => JSON.parse(line) as unknown)).toMatchObject([
      { level: "error", message: "dispatch_failed" },
    ]);
  });
});
