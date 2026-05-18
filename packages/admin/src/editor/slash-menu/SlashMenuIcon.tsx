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

// Hand-rolled, tree-shakeable mapping. Block specs pass their lucide
// icon name as a string; plugin blocks with unknown names fall back to
// the placeholder so the row layout stays consistent.
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
