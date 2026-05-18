import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

export function DescriptionListComponent({
  children,
}: BlockProps): ReactElement {
  return <dl className="plumix-descriptionList">{children}</dl>;
}

export function DescriptionTermComponent({
  children,
}: BlockProps): ReactElement {
  return <dt className="plumix-descriptionTerm">{children}</dt>;
}

export function DescriptionDetailComponent({
  children,
}: BlockProps): ReactElement {
  return <dd className="plumix-descriptionDetail">{children}</dd>;
}
