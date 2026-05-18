import type { Editor } from "@tiptap/react";
import type { ReactElement, ReactNode } from "react";
import { createContext, useContext, useState } from "react";
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
  return (
    <MobileInspectorSheetContext.Provider value={{ open, setOpen }}>
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
  /**
   * Rendered below the Inspector. The caller passes the same document
   * panel sections (permalink, status, taxonomies, meta boxes) the
   * right-rail Sidebar uses on desktop so mobile authors don't have
   * to context-switch between two surfaces.
   */
  readonly children?: ReactNode;
}

// Renders nothing on desktop; on mobile (<768px) the bottom Sheet
// hosts the block Inspector + the document panel. Trigger lives next
// to the drag handle.
export function MobileInspectorSheet({
  editor,
  blockRegistry,
  children,
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
          <SheetTitle>Document</SheetTitle>
          <SheetDescription className="sr-only">
            Block attributes, permalink, status, and meta boxes for this entry.
          </SheetDescription>
        </SheetHeader>
        {editor ? (
          <Inspector editor={editor} blockRegistry={blockRegistry} />
        ) : null}
        {children}
      </SheetContent>
    </Sheet>
  );
}
