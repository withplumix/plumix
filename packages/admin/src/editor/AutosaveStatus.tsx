import type { ReactElement } from "react";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils.js";

export type AutosaveStatus = "saved" | "saving" | "error";

export const AutosaveStatusContext = createContext<AutosaveStatus>("saved");

const LABEL: Readonly<Record<AutosaveStatus, string>> = {
  saved: "Saved",
  saving: "Saving...",
  error: "Failed to save",
};

export function AutosaveStatusPill(): ReactElement {
  const status = useContext(AutosaveStatusContext);
  return (
    <span
      className={cn(
        "rounded px-2 py-1 text-xs",
        status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted",
      )}
      data-testid="plumix-autosave-pill"
      data-status={status}
    >
      {LABEL[status]}
    </span>
  );
}
