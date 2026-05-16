import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

export const GROUP_LAYOUTS = [
  "flow",
  "flex-row",
  "flex-column",
  "grid",
] as const;
export type GroupLayout = (typeof GROUP_LAYOUTS)[number];

function isGroupLayout(value: unknown): value is GroupLayout {
  return (
    typeof value === "string" &&
    (GROUP_LAYOUTS as readonly string[]).includes(value)
  );
}

export function GroupComponent({ attrs, children }: BlockProps): ReactElement {
  const layout = isGroupLayout(attrs.layout) ? attrs.layout : undefined;
  return (
    <div data-plumix-block="core/group" data-layout={layout}>
      {children}
    </div>
  );
}
