import type { ComponentType, ReactElement } from "react";
import {
  ArrowDownUp,
  ChevronDownSquare,
  Code,
  CodeXml,
  Columns2,
  Heading,
  Info,
  List,
  ListOrdered,
  ListTree,
  Minus,
  MousePointer,
  MousePointerClick,
  Quote,
  SquareDashed,
  SquareStack,
  Table,
  Type,
} from "lucide-react";

// Named imports so lucide-react tree-shakes; a dynamic
// `lucide-react/<name>` lookup would pull every icon into the bundle.
const ICONS: Record<string, ComponentType<{ readonly className?: string }>> = {
  ArrowDownUp,
  ChevronDownSquare,
  Code,
  CodeXml,
  Columns2,
  Heading,
  Info,
  List,
  ListOrdered,
  ListTree,
  Minus,
  MousePointer,
  MousePointerClick,
  Quote,
  SquareStack,
  Table,
  Type,
};

export function SlashMenuIcon({
  name,
}: {
  readonly name?: string;
}): ReactElement {
  const Icon = name ? ICONS[name] : undefined;
  const Resolved = Icon ?? SquareDashed;
  return (
    <Resolved
      aria-hidden="true"
      className="text-muted-foreground size-4 shrink-0"
    />
  );
}
