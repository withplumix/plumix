import type { ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";
import { sanitizeHref } from "../marks/safe-href.js";

export default function ButtonView({
  attrs,
  blockProps,
}: BlockViewProps): ReactNode {
  const label = typeof attrs.label === "string" ? attrs.label : "";
  const href = sanitizeHref(attrs.href);
  const newTab = attrs.openInNewTab === true;
  if (href) {
    return (
      <a
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        {...blockProps}
      >
        {label}
      </a>
    );
  }
  return (
    <button type="button" {...blockProps}>
      {label}
    </button>
  );
}
