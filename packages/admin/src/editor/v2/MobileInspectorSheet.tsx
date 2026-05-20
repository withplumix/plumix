import type { ReactElement, ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet.js";

interface MobileInspectorSheetProps {
  readonly children: ReactNode;
}

export function MobileInspectorSheet({
  children,
}: MobileInspectorSheetProps): ReactElement {
  return (
    <Sheet>
      <SheetTrigger
        className="fixed right-4 bottom-4 z-40 rounded-full border bg-background px-3 py-2 text-xs shadow-md"
        data-testid="plumix-editor-mobile-inspector-trigger"
      >
        Inspector
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[80dvh] overflow-y-auto">
        <SheetHeader className="sr-only">
          <SheetTitle>Inspector</SheetTitle>
          <SheetDescription>
            Block actions, fields, and style controls for the selected block.
          </SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
