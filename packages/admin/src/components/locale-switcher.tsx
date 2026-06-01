import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";

import type { PlumixManifest } from "@plumix/core/manifest";

interface LocaleSwitcherProps {
  readonly currentCode: string;
  readonly manifest: PlumixManifest;
  readonly onSelect: (code: string) => void;
}

export function LocaleSwitcher({
  currentCode,
  manifest,
  onSelect,
}: LocaleSwitcherProps): ReactNode {
  const locales = manifest.i18n?.locales ?? [];
  return (
    <Select value={currentCode} onValueChange={onSelect}>
      <SelectTrigger
        data-testid="locale-switcher-trigger"
        aria-label="Language"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((l) => (
          <SelectItem
            key={l.code}
            value={l.code}
            data-testid={`locale-switcher-option-${l.code}`}
          >
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
