import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useLingui } from "@lingui/react";

import type { PlumixManifest } from "@plumix/core/manifest";

interface LoginLocaleSwitcherProps {
  readonly currentCode: string;
  readonly manifest: PlumixManifest;
  readonly onSelect: (code: string) => void;
}

/** Pre-auth locale picker shown beneath the login form. Pure
 *  presentational — the route wires the URL `?lang=` ↔ `currentCode`
 *  via `useSearch` / `useNavigate`. No cookie, no localStorage per the
 *  design constraint that pre-auth state can't fragment the public
 *  cache. The post-auth equivalent (`<LocaleSwitcher>`) ships the same
 *  shape but persists to `user.meta.locale` via RPC instead. */
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
