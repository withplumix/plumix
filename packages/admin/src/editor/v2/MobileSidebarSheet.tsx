import type { ReactElement, ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet.js";

interface MobileSidebarSheetProps {
  readonly triggerLabel: string;
  readonly triggerTestId: string;
  readonly triggerSide: "left" | "right";
  readonly sheetTitle: string;
  readonly sheetDescription: string;
  readonly children: ReactNode;
}

const SIDE_CLASS: Readonly<Record<"left" | "right", string>> = {
  left: "left-4",
  right: "right-4",
};

export function MobileSidebarSheet({
  triggerLabel,
  triggerTestId,
  triggerSide,
  sheetTitle,
  sheetDescription,
  children,
}: MobileSidebarSheetProps): ReactElement {
  return (
    <Sheet>
      <SheetTrigger
        className={`fixed bottom-4 ${SIDE_CLASS[triggerSide]} z-40 rounded-full border bg-background px-3 py-2 text-xs shadow-md`}
        data-testid={triggerTestId}
      >
        {triggerLabel}
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[80dvh] overflow-y-auto">
        <SheetHeader className="sr-only">
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription>{sheetDescription}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
