import { afterEach, describe, expect, test, vi } from "vitest";

import { cacheBustUrl, importWithRetry } from "./island-import.js";

describe("cacheBustUrl", () => {
  test("appends the retry marker as a hash", () => {
    expect(cacheBustUrl("/assets/counter.js", 42)).toBe(
      "/assets/counter.js#plumix-retry=42",
    );
  });
});

describe("importWithRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("imports the URL once when the first import succeeds", async () => {
    const urls: string[] = [];

    await importWithRetry(
      (url) => {
        urls.push(url);
        return Promise.resolve({ default: "chunk" });
      },
      "/assets/counter.js",
      () => Promise.resolve(),
    );

    expect(urls).toEqual(["/assets/counter.js"]);
  });

  test("waits after a failed import, then retries once at a cache-busted URL", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: 1700 });
    const steps: string[] = [];

    const mod = await importWithRetry(
      (url) => {
        steps.push(`import ${url}`);
        return steps.length === 1
          ? Promise.reject(new Error("chunk gone"))
          : Promise.resolve({ default: "chunk" });
      },
      "/assets/counter.js",
      () => {
        steps.push("wait");
        return Promise.resolve();
      },
    );

    expect(mod).toEqual({ default: "chunk" });
    expect(steps).toEqual([
      "import /assets/counter.js",
      "wait",
      "import /assets/counter.js#plumix-retry=1700",
    ]);
  });

  test("rejects with the retry's error when the retry fails too", async () => {
    let attempt = 0;

    const imported = importWithRetry(
      () => {
        attempt += 1;
        return Promise.reject(new Error(`attempt ${String(attempt)} failed`));
      },
      "/assets/counter.js",
      () => Promise.resolve(),
    );

    await expect(imported).rejects.toThrow("attempt 2 failed");
  });
});
