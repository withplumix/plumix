import type { Page } from "@playwright/test";

/** One `plumix:*` island event, reduced to what a spec asserts on. */
export interface IslandEvent {
  readonly type: string;
  /** The island's `component-export`, when the event names its element. */
  readonly exportName: string | null;
  readonly message: string | null;
}

/**
 * Records every island event from before the page's first script runs: an
 * island can fail during the runtime's own bootstrap, before a spec could
 * listen.
 */
export async function recordIslandEvents(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const events: unknown[] = [];
    Object.assign(window, { __plumixIslandEvents: events });
    for (const type of [
      "plumix:hydration-error",
      "plumix:island-error",
      "plumix:island-hydration-mismatch",
      "plumix:unmount",
    ]) {
      window.addEventListener(type, (event) => {
        const detail = (
          event as CustomEvent<{ error?: unknown; element?: Element }>
        ).detail;
        events.push({
          type,
          exportName: detail.element?.getAttribute("component-export") ?? null,
          message: detail.error instanceof Error ? detail.error.message : null,
        });
      });
    }
  });
}

export function islandEvents(page: Page): Promise<IslandEvent[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __plumixIslandEvents: IslandEvent[] })
        .__plumixIslandEvents,
  );
}
