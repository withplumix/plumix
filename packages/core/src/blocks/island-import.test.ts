import { afterEach, describe, expect, test, vi } from "vitest";

import type { ReloadablePage } from "./island-import.js";
import {
  cacheBustUrl,
  importWithRetry,
  reloadOnImportFailure,
} from "./island-import.js";

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

    const load = vi
      .fn<(url: string) => Promise<{ default: string }>>()
      .mockImplementationOnce((url) => {
        steps.push(`import ${url}`);
        return Promise.reject(new Error("chunk gone"));
      })
      .mockImplementationOnce((url) => {
        steps.push(`import ${url}`);
        return Promise.resolve({ default: "chunk" });
      });

    const mod = await importWithRetry(load, "/assets/counter.js", () => {
      steps.push("wait");
      return Promise.resolve();
    });

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

type FakeStorage = ReturnType<ReloadablePage["storage"]>;

function memoryStorage(): () => FakeStorage {
  const stored = new Map<string, string>();
  const storage: FakeStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => void stored.set(key, value),
  };
  return () => storage;
}

function fakePage(
  storage: () => FakeStorage = memoryStorage(),
  url = "https://site.test/recipes",
) {
  const page = {
    url,
    reloads: 0,
    storage,
    reload: () => {
      page.reloads += 1;
    },
  };
  return page;
}

async function hydrationErrorAfterImportFails(): Promise<CustomEvent> {
  const error: unknown = await importWithRetry(
    () =>
      Promise.reject(
        new TypeError("Failed to fetch dynamically imported module"),
      ),
    "/assets/counter-abc123.js",
    () => Promise.resolve(),
  ).catch((err: unknown) => err);
  return new CustomEvent("plumix:hydration-error", {
    detail: { error },
    cancelable: true,
  });
}

describe("reloadOnImportFailure", () => {
  test("reloads the page once a component import fails twice", async () => {
    const page = fakePage();

    reloadOnImportFailure(await hydrationErrorAfterImportFails(), page);

    expect(page.reloads).toBe(1);
  });

  test("doesn't reload the same URL a second time in a session", async () => {
    const page = fakePage();

    reloadOnImportFailure(await hydrationErrorAfterImportFails(), page);
    reloadOnImportFailure(await hydrationErrorAfterImportFails(), page);

    expect(page.reloads).toBe(1);
  });

  test("reloads another URL in the same session", async () => {
    const storage = memoryStorage();
    const recipes = fakePage(storage);
    const about = fakePage(storage, "https://site.test/about");

    reloadOnImportFailure(await hydrationErrorAfterImportFails(), recipes);
    reloadOnImportFailure(await hydrationErrorAfterImportFails(), about);

    expect([recipes.reloads, about.reloads]).toEqual([1, 1]);
  });

  test("doesn't reload when a listener called preventDefault()", async () => {
    const page = fakePage();
    const event = await hydrationErrorAfterImportFails();
    const target = new EventTarget();
    target.addEventListener("plumix:hydration-error", (e) => {
      e.preventDefault();
    });
    target.dispatchEvent(event);

    reloadOnImportFailure(event, page);

    expect(page.reloads).toBe(0);
  });

  test("doesn't reload for an error that isn't an import failure", () => {
    const page = fakePage();
    const event = new CustomEvent("plumix:hydration-error", {
      detail: { error: new Error("Cannot read properties of undefined") },
      cancelable: true,
    });

    reloadOnImportFailure(event, page);

    expect(page.reloads).toBe(0);
  });

  const blocked = (): never => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  test.each([
    { name: "reading sessionStorage", storage: blocked },
    {
      name: "getItem",
      storage: () => ({ getItem: blocked, setItem: () => undefined }),
    },
    {
      name: "setItem",
      storage: () => ({ getItem: () => null, setItem: blocked }),
    },
  ])("doesn't reload or throw when $name throws", async ({ storage }) => {
    const page = fakePage(storage);
    const event = await hydrationErrorAfterImportFails();

    expect(() => {
      reloadOnImportFailure(event, page);
    }).not.toThrow();
    expect(page.reloads).toBe(0);
  });
});
