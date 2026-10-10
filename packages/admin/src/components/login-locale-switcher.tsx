import type { ReactNode } from "react";
import { useLingui } from "@lingui/react";

import type { PlumixManifest } from "@plumix/core/manifest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";

interface LoginLocaleSwitcherProps {
  readonly currentCode: string;
  readonly manifest: PlumixManifest;
  readonly onSelect: (code: string) => void;
}

/**
 * Persists nothing itself: pre-auth state must not fragment the public cache.
 */
export function LoginLocaleSwitcher({
  currentCode,
  manifest,
  onSelect,
}: LoginLocaleSwitcherProps): ReactNode {
  const { i18n } = useLingui();
  const locales = manifest.i18n?.locales ?? [];
  if (locales.length <= 1) return null;
  return (
    <Select value={currentCode} onValueChange={onSelect}>
      <SelectTrigger
        data-testid="login-locale-switcher-trigger"
        aria-label={i18n._("login.locale.aria", undefined, {
          message: "Language",
        })}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((l) => (
          <SelectItem
            key={l.code}
            value={l.code}
            data-testid={`login-locale-switcher-option-${l.code}`}
          >
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
