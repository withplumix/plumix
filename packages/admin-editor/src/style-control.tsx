import type { ReactElement } from "react";
import { useState } from "react";
import { Trans } from "@lingui/react";

import type { StyleValue, ThemeTokens, TokenCategory } from "@plumix/blocks";
import { Input } from "@plumix/admin-ui/input";
import { Label } from "@plumix/admin-ui/label";
import { cn } from "@plumix/admin-ui/utils";

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
  const [custom, setCustom] = useState(value !== undefined && "raw" in value);
  const isCustom = category === undefined || custom;
  const group = category ? (tokens[category] ?? {}) : {};

  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {category ? (
          <div className="flex gap-0.5 text-xs">
            <ModeButton
              testId={`${testId}-mode-token`}
              active={!custom}
              onClick={() => setCustom(false)}
            >
              <Trans id="editor.styles.mode.token" message="Token" />
            </ModeButton>
            <ModeButton
              testId={`${testId}-mode-custom`}
              active={custom}
              onClick={() => setCustom(true)}
            >
              <Trans id="editor.styles.mode.custom" message="Custom" />
            </ModeButton>
          </div>
        ) : null}
      </div>
      {isCustom ? (
        <Input
          data-testid={`${testId}-custom`}
          value={value && "raw" in value ? value.raw : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : { raw: e.target.value })
          }
        />
      ) : (
        <select
          data-testid={`${testId}-token`}
          className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
          value={value && "token" in value ? value.token : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : { token: e.target.value })
          }
        >
          <option value="">—</option>
          {Object.keys(group).map((id) => (
            <option key={id} value={id}>
              {group[id]?.label ?? id}
            </option>
          ))}
        </select>
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
