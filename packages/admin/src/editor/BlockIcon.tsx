import type { ComponentType, SVGProps } from "react";

import {
  AlignLeft,
  ChevronDown,
  Code,
  Columns,
  Group,
  Heading,
  List,
  ListOrdered,
  Megaphone,
  Minus,
  MousePointerClick,
  Pilcrow,
  Quote,
  Rows,
  Square,
  Table,
  Type,
} from "@plumix/admin-ui/icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Maps the `icon` string from `defineBlock` to a lucide React component.
// `"Paragraph"` is aliased to `Pilcrow` because lucide ships a paragraph
// mark glyph under that name; unknown names fall through to a neutral
// `Square` so the layout stays consistent.
const ICON_MAP: Record<string, IconComponent> = {
  AlignLeft,
  ChevronDown,
  Code,
  Columns,
  Group,
  Heading,
  List,
  ListOrdered,
  Megaphone,
  Minus,
  MousePointerClick,
  Paragraph: Pilcrow,
  Quote,
  Rows,
  Table,
  Type,
};

interface BlockIconProps {
  readonly name: string | undefined;
  readonly className?: string;
}

export function BlockIcon({
  name,
  className = "h-4 w-4 shrink-0",
}: BlockIconProps): React.ReactElement {
  const Component: IconComponent =
    (name ? ICON_MAP[name] : undefined) ?? Square;
  return <Component className={className} aria-hidden />;
}
