import type { ReactElement } from "react";
import { Settings2 } from "lucide-react";

export const MOBILE_INSPECTOR_SHEET_ID = "plumix-mobile-inspector-sheet";

interface MobileInspectorTriggerProps {
  readonly onOpen: () => void;
  readonly open: boolean;
}

export function MobileInspectorTrigger({
  onOpen,
  open,
}: MobileInspectorTriggerProps): ReactElement {
  return (
    <button
      type="button"
      data-testid="mobile-inspector-trigger"
      aria-label="Block settings"
      aria-expanded={open}
      aria-controls={MOBILE_INSPECTOR_SHEET_ID}
      onClick={onOpen}
      className="text-muted-foreground hover:text-foreground flex h-6 w-6 items-center justify-center rounded-sm"
    >
      <Settings2 className="size-4" aria-hidden="true" />
    </button>
  );
}
