// `visible` strategy — hydrate (or prefetch) when the island scrolls near
// the viewport. Adapted from Astro's `client:visible` and Nuxt's
// `hydrateOnVisible`, with three deliberate improvements:
//
//   - Astro observes `el.children`, not the element, because
//     `<astro-island>` is `display: contents` (zero box → the observer
//     never fires). A pass-through component that renders only its children
//     then has nothing observable and stays forever un-hydrated
//     (withastro/astro#4103, #5309). `<plumix-island>` has a normal box, so
//     we observe the element directly and dodge that blind spot.
//   - Both Astro and Nuxt default `rootMargin` to the browser's `"0px"`, so
//     the chunk fetch only starts once the island is literally on-screen —
//     a flash on slow connections. We default to `"200px"` so it warms just
//     before entering view; override via `opts.rootMargin`.
//   - We return a teardown that disconnects the observer. Astro and Nuxt
//     leak the observer if the island is removed before it ever intersects;
//     the element calls this on `disconnectedCallback`.
//
// The synchronous already-in-viewport pre-check (Nuxt's) fires `loadFn`
// without ever constructing an observer for an above-the-fold island.

import type { IslandStrategy } from "../island-element.js";

const DEFAULT_ROOT_MARGIN = "200px";

export const visibleStrategy: IslandStrategy = (loadFn, opts, el) => {
  if (isInViewport(el)) {
    void loadFn();
    return;
  }
  const rootMargin =
    typeof opts.rootMargin === "string" ? opts.rootMargin : DEFAULT_ROOT_MARGIN;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.disconnect();
        void loadFn();
        return;
      }
    },
    { rootMargin },
  );
  io.observe(el);
  return () => io.disconnect();
};

function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const viewportWidth = self.innerWidth || document.documentElement.clientWidth;
  const viewportHeight =
    self.innerHeight || document.documentElement.clientHeight;
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < viewportHeight &&
    rect.left < viewportWidth
  );
}

export function registerVisibleStrategy(): void {
  const target = self as unknown as {
    Plumix?: Record<string, IslandStrategy>;
  };
  target.Plumix = { ...(target.Plumix ?? {}), visible: visibleStrategy };
}
