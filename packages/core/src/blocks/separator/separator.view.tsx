import type { ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";

export default function SeparatorView({
  blockProps,
}: BlockViewProps): ReactNode {
  return <hr {...blockProps} />;
}
