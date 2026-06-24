import type { ReactElement } from "react";
import { Trans } from "@lingui/react";

import type { StyleValue } from "@plumix/blocks";
import { Button } from "@plumix/admin-ui/button";
import { Trash2 } from "@plumix/admin-ui/icons";
import { Input } from "@plumix/admin-ui/input";

export interface StyleDeclaration {
  /** CSS property (camelCase), as stored in the bucket. */
  readonly property: string;
  readonly value: StyleValue;
}

interface StyleDeclarationsProps {
  readonly declarations: readonly StyleDeclaration[];
  /** Set a property's raw value, or clear it with `null`. */
  readonly onChange: (property: string, value: StyleValue | null) => void;
}

/**
 * The compiled list of every declaration in the active bucket — the escape
 * hatch that mirrors what the structured controls write. Raw declarations are
 * editable inline; token declarations (set via a control's token mode) show
 * their token id read-only, since their value lives in the theme.
 */
export function StyleDeclarations({
  declarations,
  onChange,
}: StyleDeclarationsProps): ReactElement {
  return (
    <div className="flex flex-col gap-1" data-testid="style-declarations">
      {declarations.map(({ property, value }) => (
        <div
          key={property}
          className="flex items-center gap-2"
          data-testid={`style-declaration-${property}`}
        >
          <span
            className="text-muted-foreground w-1/3 shrink-0 truncate text-xs"
            title={property}
          >
            {property}
          </span>
          {"raw" in value ? (
            <Input
              className="h-8"
              data-testid={`style-declaration-${property}-value`}
              value={value.raw}
              // Empty-string stays a (raw) declaration rather than clearing —
              // otherwise clearing the field to retype unmounts the focused row.
              // The Trash button is the sole delete affordance.
              onChange={(e) => onChange(property, { raw: e.target.value })}
            />
          ) : (
            <span
              className="text-muted-foreground flex-1 truncate text-xs italic"
              data-testid={`style-declaration-${property}-token`}
            >
              {value.token}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            data-testid={`style-declaration-${property}-remove`}
            onClick={() => onChange(property, null)}
          >
            <Trash2 />
            <span className="sr-only">
              <Trans id="editor.styles.remove" message="Remove" />
            </span>
          </Button>
        </div>
      ))}
      {declarations.length === 0 ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="style-declarations-empty"
        >
          <Trans
            id="editor.styles.none"
            message="No styles set for this device."
          />
        </p>
      ) : null}
    </div>
  );
}
