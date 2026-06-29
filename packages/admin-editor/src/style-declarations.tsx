import type { ReactElement } from "react";
import { useState } from "react";
import { Trans, useLingui } from "@lingui/react";

import type { StyleValue, ThemeTokens } from "@plumix/blocks";
import { Button } from "@plumix/admin-ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@plumix/admin-ui/command";
import { ChevronsUpDown, Plus, Trash2 } from "@plumix/admin-ui/icons";
import { Input } from "@plumix/admin-ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@plumix/admin-ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { cn } from "@plumix/admin-ui/utils";
import { tokenCategoryForProperty, tokenCssVar } from "@plumix/blocks";

import { CSS_PROPERTIES } from "./css-properties.js";

// A camelCase standard property (`marginTop`) or a CSS custom property
// (`--brand-gap`) — stricter than the render guard, which also tolerates junk.
const VALID_PROPERTY = /^(--)?[a-zA-Z][a-zA-Z-]*$/;

// Radix Select forbids an empty-string item value, so the "clear" choice
// carries a sentinel that maps back to `null` on change.
const NONE_VALUE = "__none__";

export interface StyleDeclaration {
  /** CSS property (camelCase), as stored in the bucket. */
  readonly property: string;
  readonly value: StyleValue;
}

interface StyleDeclarationsProps {
  readonly declarations: readonly StyleDeclaration[];
  /** Theme tokens, for the per-property token picker on token-valued rows. */
  readonly tokens: ThemeTokens;
  /** Set a property's raw value, or clear it with `null`. */
  readonly onChange: (property: string, value: StyleValue | null) => void;
  /** Rename a property in place, keeping its value. */
  readonly onRename: (from: string, to: string) => void;
}

/**
 * The compiled list of every declaration in the active bucket — the escape
 * hatch that mirrors what the structured controls write. Raw declarations edit
 * as a text value; token declarations edit through an inline token picker of
 * the property's theme scale.
 */
export function StyleDeclarations({
  declarations,
  tokens,
  onChange,
  onRename,
}: StyleDeclarationsProps): ReactElement {
  const keys = declarations.map((d) => d.property);
  return (
    <div className="flex flex-col gap-1" data-testid="style-declarations">
      {declarations.map(({ property, value }) => (
        <DeclarationRow
          key={property}
          property={property}
          value={value}
          siblingKeys={keys}
          tokens={tokens}
          onChange={onChange}
          onRename={onRename}
        />
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
      <AddDeclaration onAdd={onChange} existingKeys={keys} />
    </div>
  );
}

/** One declaration row: an editable property name (renamed on commit), the raw
 *  value input (or a token picker), and a remove button. Keyed by property in
 *  the parent, so the draft re-inits when the row's identity changes. */
function DeclarationRow({
  property,
  value,
  siblingKeys,
  tokens,
  onChange,
  onRename,
}: {
  readonly property: string;
  readonly value: StyleValue;
  readonly siblingKeys: readonly string[];
  readonly tokens: ThemeTokens;
  readonly onChange: (property: string, value: StyleValue | null) => void;
  readonly onRename: (from: string, to: string) => void;
}): ReactElement {
  const [keyDraft, setKeyDraft] = useState(property);
  const category = tokenCategoryForProperty(property);
  const tokenGroup = category ? (tokens[category] ?? {}) : {};
  // Show a token as the CSS variable it emits (`var(--plumix-color-primary)`),
  // not its label or resolved literal — this is the raw-CSS view.
  const tokenVar = (id: string): string =>
    category ? tokenCssVar(id, category) : id;

  const commitRename = (): void => {
    const next = keyDraft.trim();
    const valid =
      next !== property &&
      VALID_PROPERTY.test(next) &&
      !siblingKeys.includes(next);
    if (valid) onRename(property, next);
    else setKeyDraft(property); // snap back on a no-op / invalid edit
  };

  return (
    <div
      className="flex items-center gap-2"
      data-testid={`style-declaration-${property}`}
    >
      <Input
        className="h-8 w-1/3 shrink-0"
        data-testid={`style-declaration-${property}-key`}
        value={keyDraft}
        onChange={(e) => setKeyDraft(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
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
        <Select
          value={value.token === "" ? NONE_VALUE : value.token}
          onValueChange={(next) =>
            onChange(property, next === NONE_VALUE ? null : { token: next })
          }
        >
          <SelectTrigger
            size="sm"
            className="w-full"
            data-testid={`style-declaration-${property}-token`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value={NONE_VALUE}
              data-testid={`style-declaration-${property}-token-none`}
            >
              —
            </SelectItem>
            {/* Keep an unknown token (stale id, or a property with no token
                scale) visible + selected — a controlled select with no matching
                item would render blank, hiding the stored value. */}
            {value.token !== "" && !(value.token in tokenGroup) ? (
              <SelectItem value={value.token}>
                {tokenVar(value.token)}
              </SelectItem>
            ) : null}
            {Object.keys(tokenGroup).map((id) => (
              <SelectItem
                key={id}
                value={id}
                data-testid={`style-declaration-${property}-token-${id}`}
              >
                {tokenVar(id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive size-8 shrink-0"
        data-testid={`style-declaration-${property}-remove`}
        onClick={() => onChange(property, null)}
      >
        <Trash2 />
        <span className="sr-only">
          <Trans id="editor.styles.remove" message="Remove" />
        </span>
      </Button>
    </div>
  );
}

/** Key + value entry row that appends a raw declaration. The property is picked
 *  from a searchable combobox of common CSS properties (or typed for one not in
 *  the list); already-set properties are excluded so a new entry can't silently
 *  clobber an existing row. Submit also needs a non-empty value. */
function AddDeclaration({
  onAdd,
  existingKeys,
}: {
  readonly onAdd: (property: string, value: StyleValue) => void;
  readonly existingKeys: readonly string[];
}): ReactElement {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [property, setProperty] = useState("");
  const [value, setValue] = useState("");

  const taken = new Set(existingKeys);
  const options = CSS_PROPERTIES.filter((name) => !taken.has(name));
  // Offer the typed query as a creatable property when it's a valid name that
  // isn't already a listed option or an existing declaration — this is how a
  // property outside the curated list (e.g. a vendor prefix) gets added. The
  // collision check is case-insensitive: `margintop` must not create a second
  // declaration alongside the curated `marginTop`.
  const custom = query.trim();
  const known = new Set(
    [...CSS_PROPERTIES, ...existingKeys].map((p) => p.toLowerCase()),
  );
  const canCreate =
    VALID_PROPERTY.test(custom) && !known.has(custom.toLowerCase());

  const pick = (name: string): void => {
    setProperty(name);
    setQuery("");
    setOpen(false);
  };

  // Re-check `taken` at submit, not just at pick: a property picked here can be
  // set elsewhere (a structured control, undo) before submit, and the write
  // overwrites unconditionally — so the gate is the only no-clobber guard.
  const valid = property !== "" && !taken.has(property) && value.trim() !== "";

  return (
    <form
      className="flex items-center gap-2 pt-1"
      data-testid="style-declaration-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onAdd(property, { raw: value });
        setProperty("");
        setValue("");
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            data-testid="style-declaration-add-key"
            className={cn(
              "h-8 w-1/3 shrink-0 justify-between gap-1 font-normal",
              property === "" && "text-muted-foreground",
            )}
          >
            <span className="truncate">
              {property === "" ? (
                <Trans id="editor.styles.add.key" message="property" />
              ) : (
                property
              )}
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={i18n._({
                id: "editor.styles.add.search",
                message: "Search property…",
              })}
              data-testid="style-declaration-add-key-search"
            />
            <CommandList>
              {canCreate ? (
                <CommandItem
                  value={custom}
                  onSelect={() => pick(custom)}
                  data-testid="style-declaration-add-key-create"
                >
                  <Plus className="me-2 size-4" />
                  <span className="sr-only">
                    <Trans id="editor.styles.add.create" message="Create" />
                  </span>
                  {custom}
                </CommandItem>
              ) : (
                <CommandEmpty>
                  <Trans id="editor.styles.add.none" message="No property." />
                </CommandEmpty>
              )}
              <CommandGroup>
                {options.map((name) => (
                  <CommandItem
                    key={name}
                    value={name}
                    onSelect={() => pick(name)}
                    data-testid={`style-declaration-add-key-option-${name}`}
                  >
                    {name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        className="h-8"
        data-testid="style-declaration-add-value"
        placeholder={i18n._({
          id: "editor.styles.add.value",
          message: "value",
        })}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        disabled={!valid}
        data-testid="style-declaration-add-submit"
      >
        <Plus />
        <span className="sr-only">
          <Trans id="editor.styles.add" message="Add style" />
        </span>
      </Button>
    </form>
  );
}
