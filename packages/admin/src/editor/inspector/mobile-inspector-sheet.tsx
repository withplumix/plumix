import type { Editor } from "@tiptap/react";
import type { ReactElement, ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.js";
import { useIsMobile } from "@/hooks/use-mobile.js";

import type { BlockRegistry } from "@plumix/blocks";

import { Inspector } from "./Inspector.js";

interface MobileInspectorSheetContextValue {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

const MobileInspectorSheetContext =
  createContext<MobileInspectorSheetContextValue | null>(null);

// Coordinates the open state across the trigger (rendered next to the
// drag handle) and the Sheet (rendered alongside the editor canvas).
export function MobileInspectorSheetProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const value = useMemo<MobileInspectorSheetContextValue>(
    () => ({ open, setOpen }),
    [open],
  );
  return (
    <MobileInspectorSheetContext.Provider value={value}>
      {children}
    </MobileInspectorSheetContext.Provider>
  );
}

export function useMobileInspectorSheet(): MobileInspectorSheetContextValue {
  const value = useContext(MobileInspectorSheetContext);
  if (!value) {
    // eslint-disable-next-line no-restricted-syntax -- React hook-misuse guard; convention exception per umbrella #232
    throw new Error(
      "useMobileInspectorSheet must be used inside MobileInspectorSheetProvider",
    );
  }
  return value;
}

interface MobileInspectorSheetProps {
  readonly editor: Editor | null;
  readonly blockRegistry: BlockRegistry;
}

// Renders nothing on desktop; on mobile (<768px) the bottom Sheet
// hosts the block Inspector. Trigger lives next to the drag handle.
export function MobileInspectorSheet({
  editor,
  blockRegistry,
}: MobileInspectorSheetProps): ReactElement | null {
  const isMobile = useIsMobile();
  const { open, setOpen } = useMobileInspectorSheet();
  if (!isMobile) return null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        className="h-[80vh] overflow-y-auto"
        data-testid="mobile-inspector-sheet"
      >
        <SheetHeader>
          <SheetTitle>Block settings</SheetTitle>
          <SheetDescription className="sr-only">
            Attributes and styles for the selected block.
          </SheetDescription>
        </SheetHeader>
        {editor ? (
          <Inspector editor={editor} blockRegistry={blockRegistry} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
