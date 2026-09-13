import { describe, expect, test, vi } from "vitest";

import type { RequestListener } from "../http/bridge.js";
import type { LoadedSite } from "./site-reloader.js";
import { createSiteReloader } from "./site-reloader.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fault) => {
    resolve = settle;
    reject = fault;
  });
  return { promise, resolve, reject };
}

const listener = (): RequestListener => () => undefined;
const fail = listener;

function site() {
  return {
    listener: listener(),
    scheduler: {
      start: () => Promise.resolve(),
      stop: vi.fn(() => Promise.resolve(true)),
    },
    dispose: vi.fn(() => Promise.resolve({ abandoned: 0 })),
  } satisfies LoadedSite;
}

describe("createSiteReloader", () => {
  test("a load superseded while it builds stops its own scheduler and disposes its own site", async () => {
    const reloader = createSiteReloader();
    const stale = deferred<LoadedSite>();
    const staleSite = site();

    const staleLoad = reloader.current(() => stale.promise, fail);
    reloader.invalidate();
    await reloader.current(() => Promise.resolve(site()), fail);

    stale.resolve(staleSite);
    await staleLoad;

    expect(staleSite.scheduler.stop).toHaveBeenCalled();
    expect(staleSite.dispose).toHaveBeenCalled();
  });

  test("requests waiting on a superseded load are served by the newest load's site", async () => {
    const reloader = createSiteReloader();
    const stale = deferred<LoadedSite>();
    const newestSite = site();

    const staleLoad = reloader.current(() => stale.promise, fail);
    reloader.invalidate();
    await reloader.current(() => Promise.resolve(newestSite), fail);
    stale.resolve(site());

    expect(await staleLoad).toBe(newestSite.listener);
  });

  test("the newest load owns the scheduler and site, so the next reload tears them down", async () => {
    const reloader = createSiteReloader();
    const stale = deferred<LoadedSite>();
    const newestSite = site();

    const staleLoad = reloader.current(() => stale.promise, fail);
    reloader.invalidate();
    await reloader.current(() => Promise.resolve(newestSite), fail);
    stale.resolve(site());
    await staleLoad;

    reloader.invalidate();
    await reloader.current(() => Promise.resolve(site()), fail);

    expect(newestSite.scheduler.stop).toHaveBeenCalled();
    expect(newestSite.dispose).toHaveBeenCalled();
  });

  test("a superseded load that fails hands its requests to the newest site, without its error", async () => {
    const reloader = createSiteReloader();
    const stale = deferred<LoadedSite>();
    const newestSite = site();
    const staleFail = vi.fn(fail);

    const staleLoad = reloader.current(() => stale.promise, staleFail);
    reloader.invalidate();
    await reloader.current(() => Promise.resolve(newestSite), fail);
    stale.reject(new Error("the stale config failed to parse"));

    expect(await staleLoad).toBe(newestSite.listener);
    expect(staleFail).not.toHaveBeenCalled();
    const rebuild = vi.fn(() => Promise.resolve(site()));
    expect(await reloader.current(rebuild, fail)).toBe(newestSite.listener);
    expect(rebuild).not.toHaveBeenCalled();
  });

  test("a failed load leaves nothing behind for the next reload to tear down again", async () => {
    const reloader = createSiteReloader();
    const firstSite = site();
    await reloader.current(() => Promise.resolve(firstSite), fail);

    reloader.invalidate();
    await reloader.current(
      () => Promise.reject(new Error("the config failed to parse")),
      fail,
    );

    const retry = vi.fn(() => Promise.resolve(site()));
    await reloader.current(retry, fail);

    expect(retry).toHaveBeenCalledTimes(1);
    expect(firstSite.scheduler.stop).toHaveBeenCalledTimes(1);
    expect(firstSite.dispose).toHaveBeenCalledTimes(1);
  });
});
