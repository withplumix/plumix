// The React half of the islands runtime, split out of `island-element.ts`
// so the eager element chunk carries no React. The custom element
// dynamic-imports this module inside `hydrate()` (in parallel with the
// per-island component chunk), so React + ReactDOM + StaticHtml are
// fetched only when an island actually hydrates — never on a page whose
// islands all defer below the fold. Mirrors Astro's renderer chunk
// (`packages/integrations/react/src/client.ts`).

import type { ComponentType } from "react";
import type { Root } from "react-dom/client";
import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { StaticHtml } from "./static-html.js";

type Props = Readonly<Record<string, unknown>>;

/**
 * Renderer-owned handle the custom element drives, replacing the bare
 * `Root` it held before the split. The element collects slot HTML as raw
 * strings; wrapping each in `<StaticHtml>` is React work, so it lives here.
 */
export interface IslandRoot {
  render(
    Component: ComponentType<Props>,
    props: Props,
    slotHtml: Readonly<Record<string, string>>,
  ): void;
  unmount(): void;
}

export function mount(element: HTMLElement): IslandRoot {
  const root: Root = createRoot(element);
  return {
    render(Component, props, slotHtml) {
      root.render(createElement(Component, mergeSlotProps(props, slotHtml)));
    },
    unmount() {
      root.unmount();
    },
  };
}

// Bridge each SSR'd slot's raw HTML back into a prop as a `<StaticHtml>`
// element. No-op (returns props as-is) when there are no slots, so the
// common island carries no extra allocation.
function mergeSlotProps(
  props: Props,
  slotHtml: Readonly<Record<string, string>>,
): Props {
  const names = Object.keys(slotHtml);
  if (names.length === 0) return props;
  const merged: Record<string, unknown> = { ...props };
  for (const name of names) {
    merged[name] = createElement(StaticHtml, {
      html: slotHtml[name] ?? "",
      slotName: name,
    });
  }
  return merged;
}
