import type { ReactElement } from "react";
import { Settings2 } from "lucide-react";

interface MobileInspectorTriggerProps {
  readonly onOpen: () => void;
}

export function MobileInspectorTrigger({
  onOpen,
}: MobileInspectorTriggerProps): ReactElement {
  return (
    <button
      type="button"
      data-testid="mobile-inspector-trigger"
      aria-label="Block settings"
      onClick={onOpen}
      className="text-muted-foreground hover:text-foreground flex h-6 w-6 items-center justify-center rounded-sm"
    >
      <Settings2 className="size-4" aria-hidden="true" />
    </button>
  );
}
