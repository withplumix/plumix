// `only` strategy — the component is never server-rendered; the SSR shim
// emits an empty `<plumix-island when="only">` shell and the client renders
// into it on connect. At runtime that's the same trigger as `load` (fire
// immediately), so this delegates the timing; the behavioural difference
// lives entirely in the SSR shim (no markup, no `ssr` gate attribute).
// Registered under its own name so the element's dispatcher resolves
// `client="only"`.

import type { IslandStrategy } from "../island-element.js";

export const onlyStrategy: IslandStrategy = (loadFn) => {
  void loadFn();
};

export function registerOnlyStrategy(): void {
  const target = self as unknown as {
    Plumix?: Record<string, IslandStrategy>;
  };
  target.Plumix = { ...(target.Plumix ?? {}), only: onlyStrategy };
}
