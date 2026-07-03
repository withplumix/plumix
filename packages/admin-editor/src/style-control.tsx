import type { ReactElement } from "react";
import { useState } from "react";
import { Trans } from "@lingui/react";

import type { ThemeTokens, TokenCategory } from "@plumix/blocks";
import { Input } from "@plumix/admin-ui/input";
import { Label } from "@plumix/admin-ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { cn } from "@plumix/admin-ui/utils";
import { tokenIdFromCssVar, tokenIdToCssVar } from "@plumix/blocks";

// Native `<input type="color">` only round-trips 6-digit hex; anything else
// (a token var(), `transparent`, rgba) leaves the swatch on a safe default.
export const HEX6 = /^#[0-9a-fA-F]{6}$/;

// Radix Select forbids an empty-string item value, so the "clear" choice
// carries a sentinel that maps back to `null` on change.
const NONE_VALUE = "__none__";

interface StyleControlProps {
  readonly label: string;
  /** CSS property (camelCase), used for ids and the store write. */
  readonly property: string;
  /** Token group offered in token mode; omit for a custom-value-only control. */
  readonly category?: TokenCategory;
  readonly value: string | undefined;
  readonly tokens: ThemeTokens;
  /** Emits the next CSS value string, or null to clear the property. */
  readonly onChange: (value: string | null) => void;
}

/**
 * One style property edited as a theme token OR a custom value. Both store a
 * plain CSS value string: token mode writes the token's `var(--plumix-…,
 * fallback)` (a theme reskins it by redefining the variable), custom mode
 * writes a raw literal. A control without a `category` is custom-only.
 */
export function StyleControl({
  label,
  property,
  category,
  value,
  tokens,
  onChange,
}: StyleControlProps): ReactElement {
  const testId = `style-control-${property}`;
  const group = category ? (tokens[category] ?? {}) : {};
  // Mode follows the current value's kind, so a value set elsewhere (the
  // declarations list, another control) reflects here live. With no value, the
  // user's last toggle (`pref`) decides which input to show — and it starts on
  // custom when the theme declares no tokens for this category (an empty token
  // dropdown is useless; token mode only leads when there's something to pick).
  const [pref, setPref] = useState<"token" | "custom">(
    Object.keys(group).length > 0 ? "token" : "custom",
  );
  // The value is a token when it's a `var()` for this category (even an id the
  // theme no longer declares — it still edits in token mode); else it's custom.
  const tokenId =
    category && value !== undefined ? tokenIdFromCssVar(value, category) : null;
  const isCustom =
    category === undefined ||
    (value !== undefined ? tokenId === null : pref === "custom");
  const isColor = category === "color";
  const custom = isCustom && value !== undefined ? value : "";

  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      {/* Label over the Token/Custom toggle (not side-by-side) so the toggle
          never clips in the narrow half-width grid cells. */}
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs">{label}</Label>
        {category ? (
          <div className="flex gap-0.5 text-xs">
            <ModeButton
              testId={`${testId}-mode-token`}
              active={!isCustom}
              // Clear a custom value when switching to token mode so the select
              // isn't shadowed by a value it can't represent.
              onClick={() => {
                setPref("token");
                if (value !== undefined && tokenId === null) onChange(null);
              }}
            >
              <Trans id="editor.styles.mode.token" message="Token" />
            </ModeButton>
            <ModeButton
              testId={`${testId}-mode-custom`}
              active={isCustom}
              onClick={() => {
                setPref("custom");
                if (tokenId !== null) onChange(null);
              }}
            >
              <Trans id="editor.styles.mode.custom" message="Custom" />
            </ModeButton>
          </div>
        ) : null}
      </div>
      {isCustom ? (
        <div className="flex gap-1">
          {isColor ? (
            <input
              type="color"
              data-testid={`${testId}-swatch`}
              aria-label={`${label} color`}
              value={HEX6.test(custom) ? custom : "#000000"}
              onChange={(e) => onChange(e.target.value)}
              className="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
            />
          ) : null}
          <Input
            data-testid={`${testId}-custom`}
            value={custom}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : e.target.value)
            }
          />
        </div>
      ) : (
        <Select
          value={tokenId ?? NONE_VALUE}
          onValueChange={(next) =>
            onChange(
              next === NONE_VALUE
                ? null
                : tokenIdToCssVar(next, category, tokens),
            )
          }
        >
          <SelectTrigger className="w-full" data-testid={`${testId}-token`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE} data-testid={`${testId}-token-none`}>
              —
            </SelectItem>
            {Object.keys(group).map((id) => (
              <SelectItem
                key={id}
                value={id}
                data-testid={`${testId}-token-${id}`}
              >
                {group[id]?.label ?? id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function ModeButton({
  testId,
  active,
  onClick,
  children,
}: {
  readonly testId: string;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
