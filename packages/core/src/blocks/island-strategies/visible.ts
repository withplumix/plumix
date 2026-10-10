// Observes the element itself, not its children, so a children-only component
// stays observable (withastro/astro#4103). The 200px margin warms the chunk
// before it enters view.

import type { IslandStrategy } from "../island-element.js";
import { publishIslandStrategy } from "../island-global.js";

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
  publishIslandStrategy("visible", visibleStrategy);
}
