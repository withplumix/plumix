import type { ReactElement } from "react";
import { useState } from "react";
import { Trans } from "@lingui/react";

import type { StyleValue, ThemeTokens, TokenCategory } from "@plumix/blocks";
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

// Native `<input type="color">` only round-trips 6-digit hex; anything else
// (a token-ish string, `transparent`, rgba) leaves the swatch on a safe default.
const HEX6 = /^#[0-9a-fA-F]{6}$/;

// Radix Select forbids an empty-string item value, so the "clear" choice
// carries a sentinel that maps back to `null` on change.
const NONE_VALUE = "__none__";

interface StyleControlProps {
  readonly label: string;
  /** CSS property (camelCase), used for ids and the store write. */
  readonly property: string;
  /** Token group offered in token mode; omit for a custom-value-only control. */
  readonly category?: TokenCategory;
  readonly value: StyleValue | undefined;
  readonly tokens: ThemeTokens;
  /** Emits the next value, or null to clear the property. */
  readonly onChange: (value: StyleValue | null) => void;
}

/**
 * One style property edited as a theme token OR a custom value. Token mode
 * binds to a CSS variable (reskins with the theme); custom mode writes a raw,
 * sanitized literal (fixed). A control without a `category` is custom-only.
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
  // Mode follows the current value's kind, so a value set elsewhere (the
  // declarations list, another control) reflects here live. With no value, the
  // user's last toggle (`pref`) decides which input to show for entry.
  const [pref, setPref] = useState<"token" | "custom">("token");
  const isCustom =
    category === undefined ||
    (value !== undefined ? "raw" in value : pref === "custom");
  const isColor = category === "colors";
  const group = category ? (tokens[category] ?? {}) : {};
  const raw = value && "raw" in value ? value.raw : "";

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
              // Clear a raw value when switching to token mode so the select
              // isn't shadowed by a value it can't represent.
              onClick={() => {
                setPref("token");
                if (value && "raw" in value) onChange(null);
              }}
            >
              <Trans id="editor.styles.mode.token" message="Token" />
            </ModeButton>
            <ModeButton
              testId={`${testId}-mode-custom`}
              active={isCustom}
              onClick={() => {
                setPref("custom");
                if (value && "token" in value) onChange(null);
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
              value={HEX6.test(raw) ? raw : "#000000"}
              onChange={(e) => onChange({ raw: e.target.value })}
              className="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
            />
          ) : null}
          <Input
            data-testid={`${testId}-custom`}
            value={raw}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : { raw: e.target.value })
            }
          />
        </div>
      ) : (
        <Select
          value={value && "token" in value ? value.token : NONE_VALUE}
          onValueChange={(next) =>
            onChange(next === NONE_VALUE ? null : { token: next })
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
