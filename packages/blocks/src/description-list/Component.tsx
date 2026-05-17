import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

export function DescriptionListComponent({
  children,
}: BlockProps): ReactElement {
  return <dl>{children}</dl>;
}

export function DescriptionTermComponent({
  children,
}: BlockProps): ReactElement {
  return <dt>{children}</dt>;
}

export function DescriptionDetailComponent({
  children,
}: BlockProps): ReactElement {
  return <dd>{children}</dd>;
}
