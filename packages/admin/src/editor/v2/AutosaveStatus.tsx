import type { ReactElement } from "react";
import { createContext, useContext } from "react";

export type AutosaveStatus = "saved" | "saving";

export const AutosaveStatusContext = createContext<AutosaveStatus>("saved");

const LABEL: Readonly<Record<AutosaveStatus, string>> = {
  saved: "Saved",
  saving: "Saving...",
};

export function AutosaveStatusPill(): ReactElement {
  const status = useContext(AutosaveStatusContext);
  return (
    <span
      className="rounded bg-muted px-2 py-1 text-xs"
      data-testid="plumix-autosave-pill"
      data-status={status}
    >
      {LABEL[status]}
    </span>
  );
}
