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
    logger.warn("slow_query");

    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      {
        level: "info",
        message: "cache_purged",
        time: "2026-10-11T09:30:00.000Z",
        tags: ["entry:1"],
      },
      {
        level: "warn",
        message: "slow_query",
        time: "2026-10-11T09:30:00.000Z",
      },
    ]);
  });

  test("serializes an error in the meta with its name, message and stack", () => {
    const { logger, lines } = capture();
    const error = new TypeError("boom");

    logger.error("dispatch_failed", { error, path: "/blog" });

    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      level: "error",
      path: "/blog",
      error: { name: "TypeError", message: "boom", stack: error.stack },
    });
  });
});
