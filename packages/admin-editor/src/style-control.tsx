import type { ReactElement } from "react";
import { useId } from "react";
import { Trans } from "@lingui/react";

import type { TokenCategory } from "@plumix/blocks";
import { Field, FieldLabel } from "@plumix/admin-ui/field";
import { Input } from "@plumix/admin-ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { cn } from "@plumix/admin-ui/utils";

import { useStyleField } from "./use-style-field.js";

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
  /** Token scale offered in token mode; omit for a custom-value-only control. */
  readonly category?: TokenCategory;
  readonly value: string | undefined;
  /** Emits the next CSS value string, or null to clear the property. */
  readonly onChange: (value: string | null) => void;
}

/**
 * One style property edited as a theme token OR a custom value. Both store a
 * plain CSS value string: token mode writes the token's `var(--plumix-…,
 * fallback)` (a theme reskins it by redefining the variable), custom mode
 * writes a raw literal. A control without a `category` is custom-only. The
 * token/literal encoding and the Token/Custom mode machine live in
 * {@link useStyleField} — this component only renders and dispatches.
 */
export function StyleControl({
  label,
  property,
  category,
  value,
  onChange,
}: StyleControlProps): ReactElement {
  const testId = `style-control-${property}`;
  const controlId = useId();
  // A control with no `category` is custom-only — it never offers tokens, even
  // for a property the field could derive a scale for (e.g. max-width).
  const showModes = category !== undefined;
  const field = useStyleField(property, value, {
    onChange,
    category,
    literalOnly: !showModes,
  });
  const isCustom = field.mode === "custom";

  return (
    <Field className="gap-1" data-testid={testId}>
      {/* Label above the Token/Custom toggle (not side-by-side) so the toggle
          never clips in the narrow half-width grid cells; the toggle sits at
          the right edge under the label. */}
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={controlId} className="text-xs">
          {label}
        </FieldLabel>
        {showModes ? (
          <div className="flex justify-end gap-0.5 text-xs">
            <ModeButton
              testId={`${testId}-mode-token`}
              active={!isCustom}
              onClick={() => field.setMode("token")}
            >
              <Trans id="editor.styles.mode.token" message="Token" />
            </ModeButton>
            <ModeButton
              testId={`${testId}-mode-custom`}
              active={isCustom}
              onClick={() => field.setMode("custom")}
            >
              <Trans id="editor.styles.mode.custom" message="Custom" />
            </ModeButton>
          </div>
        ) : null}
      </div>
      {isCustom ? (
        <div className="flex gap-1">
          {field.isColor ? (
            <input
              type="color"
              data-testid={`${testId}-swatch`}
              aria-label={`${label} color`}
              value={
                HEX6.test(field.literalText) ? field.literalText : "#000000"
              }
              onChange={(e) => field.setLiteral(e.target.value)}
              className="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
            />
          ) : null}
          <Input
            id={controlId}
            data-testid={`${testId}-custom`}
            value={field.literalText}
            onChange={(e) => field.setLiteral(e.target.value)}
          />
        </div>
      ) : (
        <Select
          value={field.tokenId ?? NONE_VALUE}
          onValueChange={(next) =>
            next === NONE_VALUE ? field.clear() : field.setToken(next)
          }
        >
          <SelectTrigger
            id={controlId}
            className="w-full"
            data-testid={`${testId}-token`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE} data-testid={`${testId}-token-none`}>
              —
            </SelectItem>
            {field.options.map((option) => (
              <SelectItem
                key={option.id}
                value={option.id}
                data-testid={`${testId}-token-${option.id}`}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
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
