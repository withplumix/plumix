import type { ReactElement } from "react";
import { useId } from "react";
import { Trans } from "@lingui/react";

import type { TokenCategory } from "@plumix/core/blocks";
import { Button } from "@plumix/admin-ui/button";
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
import { styleCategoryForProperty } from "@plumix/core/blocks";

import { useStylePolicyView } from "./style-policy-context.js";
import { useStyleField } from "./use-style-field.js";

/**
 * Native `<input type="color">` only round-trips 6-digit hex; anything else
 * (a token var(), `transparent`, rgba) leaves the swatch on a safe default.
 */
export const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * Radix Select forbids an empty-string item value, so the "clear" choice
 * carries a sentinel that maps back to `null` on change.
 */
const NONE_VALUE = "__none__";

interface StyleControlProps {
  readonly label: string;
  readonly property: string;
  /** Omit for a custom-value-only control. */
  readonly category?: TokenCategory;
  readonly value: string | undefined;
  /** The wider device's value this one renders while unset. */
  readonly inherited?: string;
  readonly onChange: (value: string | null) => void;
}

export function StyleControl({
  label,
  property,
  category,
  value,
  inherited,
  onChange,
}: StyleControlProps): ReactElement | null {
  const testId = `style-control-${property}`;
  const controlId = useId();
  const policy = useStylePolicyView();
  const customAllowed = policy.allowsCustom(property);
  // A control with no `category` is custom-only: it never offers tokens, even
  // where the field could derive a scale (max-width). Under tokens only it
  // offers that scale instead.
  const scale = customAllowed
    ? category
    : (category ?? styleCategoryForProperty(property));
  const showModes = customAllowed && category !== undefined;
  const field = useStyleField(property, value, {
    onChange,
    category: scale,
    literalOnly: scale === undefined,
    inherited,
    customAllowed,
    refused: policy.refused.some((r) => r.property === property),
  });
  if (field.hidden) return null;
  const isCustom = field.mode === "custom";
  const refusedWithoutReplacement =
    field.forbiddenText !== null && !field.hasTokens;
  const showsInput = !refusedWithoutReplacement;

  return (
    <Field size="sm" data-testid={testId}>
      {/* Label above the Token/Custom toggle (not side-by-side) so the toggle
          never clips in the narrow half-width grid cells; the toggle sits at
          the right edge under the label. */}
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
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
      {field.forbiddenText !== null ? (
        <ForbiddenValue
          value={field.forbiddenText}
          testId={`${testId}-forbidden`}
          onClear={() => field.clear()}
        />
      ) : null}
      {showsInput &&
        (isCustom ? (
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
              placeholder={field.inheritedText}
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
              <SelectItem
                value={NONE_VALUE}
                data-testid={`${testId}-token-none`}
              >
                {field.inheritedText || "—"}
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
        ))}
    </Field>
  );
}

/** A stored value the policy refuses: it can be cleared, never edited. */
export function ForbiddenValue({
  value,
  testId,
  onClear,
}: {
  readonly value: string;
  readonly testId: string;
  readonly onClear: () => void;
}): ReactElement {
  return (
    <div
      className="bg-muted flex items-center gap-1 rounded-md px-2 py-1 text-xs"
      data-testid={testId}
    >
      <span className="min-w-0 flex-1 break-all">
        <Trans
          id="editor.styles.forbiddenValue"
          message="Custom value <0>{value}</0> — not allowed by this theme"
          values={{ value }}
          components={{ 0: <code className="font-mono" /> }}
        />
      </span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={onClear}
        data-testid={`${testId}-clear`}
      >
        <Trans id="editor.styles.forbiddenValue.clear" message="Clear" />
      </Button>
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
