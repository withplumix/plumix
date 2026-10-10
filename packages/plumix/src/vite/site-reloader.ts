import type { IncomingMessage, ServerResponse } from "node:http";

import type { DisposeResult } from "@plumix/core";

/** The dev server's last middleware, as the site answers through it. */
export type DevListener = (req: IncomingMessage, res: ServerResponse) => void;

export interface LoadedSite {
  readonly listener: DevListener;
  /** What fires the site's scheduled tasks, stopped before a reload. */
  readonly scheduler?: { readonly stop: () => Promise<boolean> };
  /** Releases what the site's handler holds, once a reload replaces it. */
  readonly dispose?: () => Promise<DisposeResult>;
}

export interface SiteReloader {
  /**
   * The site's listener, built by the first call after start or `invalidate`.
   * A build that rejects answers with `fail`'s listener, and the next call
   * builds again.
   */
  readonly current: (
    build: () => Promise<LoadedSite>,
    fail: (error: unknown) => DevListener,
  ) => Promise<DevListener>;
  readonly invalidate: () => void;
}

/**
 * The dev server's site, rebuilt on the first request after an edit or a
 * restart, so that each reload replaces the app the previous one served.
 */
export function createSiteReloader(): SiteReloader {
  let listener: Promise<DevListener> | undefined;
  let live: LoadedSite | undefined;
  // Counts loads, so one that a newer load overtook can tell it lost.
  let generation = 0;
  // What a load that lost answers its requests with, so none of them bind
  // the site it tore down rather than the one the newest load owns.
  let latest: Promise<DevListener> | undefined;

  async function load(
    build: () => Promise<LoadedSite>,
    fail: (error: unknown) => DevListener,
  ): Promise<DevListener> {
    const mine = ++generation;
    // Before the build, not after it: a build that fails takes the catch
    // below, and a scheduler left running there would keep firing against
    // the app this reload replaced.
    await live?.scheduler?.stop();
    const replaced = live;
    live = undefined;
    // Released in the background so a reload never waits on deferred work; dev
    // recovers from a request losing its connection.
    void replaced?.dispose?.();
    try {
      const site = await build();
      if (mine !== generation) {
        // Would otherwise be orphaned, still firing.
        await site.scheduler?.stop();
        void site.dispose?.();
        return latest ?? site.listener;
      }
      live = site;
      return site.listener;
    } catch (error) {
      if (mine !== generation) return latest ?? fail(error);
      listener = undefined;
      return fail(error);
    }
  }

  return {
    current: (build, fail) => (listener ??= latest = load(build, fail)),
    invalidate: () => {
      listener = undefined;
    },
  };
}
