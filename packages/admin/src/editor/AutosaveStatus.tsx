import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";
import { createContext, useContext } from "react";
import { useLabel } from "@/lib/use-label.js";
import { cn } from "@/lib/utils.js";
import { defineMessage } from "@lingui/core/macro";

export type AutosaveStatus = "saved" | "saving" | "error";

export const AutosaveStatusContext = createContext<AutosaveStatus>("saved");

const LABEL: Readonly<Record<AutosaveStatus, MessageDescriptor>> = {
  saved: defineMessage({ id: "editor.autosave.saved", message: "Saved" }),
  saving: defineMessage({
    id: "editor.autosave.saving",
    message: "Saving...",
  }),
  error: defineMessage({
    id: "editor.autosave.error",
    message: "Failed to save",
  }),
};

export function AutosaveStatusPill(): ReactElement {
  const status = useContext(AutosaveStatusContext);
  const label = useLabel();
  return (
    <span
      className={cn(
        "rounded px-2 py-1 text-xs",
        status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted",
      )}
      data-testid="plumix-autosave-pill"
      data-status={status}
    >
      {label(LABEL[status])}
    </span>
  );
}
