import type { ReactElement } from "react";
import { useState } from "react";
import { Trans, useLingui } from "@lingui/react";

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
import { cn } from "@plumix/admin-ui/utils";
import { isAllowedHtmlAttr } from "@plumix/blocks";

// Common allowlisted attributes offered as suggestions. The field still accepts
// any name `isAllowedHtmlAttr` permits (e.g. an arbitrary `data-*`/`aria-*`).
const COMMON_ATTRS: readonly string[] = [
  "id",
  "title",
  "role",
  "lang",
  "dir",
  "aria-label",
  "aria-describedby",
  "aria-hidden",
  "aria-live",
  "data-testid",
];

interface HtmlAttributesProps {
  readonly attributes: Readonly<Record<string, string>>;
  /** Set an attribute's value, or clear it with `null`. */
  readonly onChange: (key: string, value: string | null) => void;
  /** Rename an attribute in place, keeping its value. */
  readonly onRename: (from: string, to: string) => void;
}

/**
 * Key/value editor for a block's HTML attributes — the same repeater as the CSS
 * section, but flat string values. Keys are constrained to the render-time
 * allowlist (`isAllowedHtmlAttr`); the value flows verbatim (React escapes it).
 */
export function HtmlAttributes({
  attributes,
  onChange,
  onRename,
}: HtmlAttributesProps): ReactElement {
  const keys = Object.keys(attributes);
  return (
    <div className="flex flex-col gap-1" data-testid="html-attributes">
      {keys.map((key) => (
        <AttrRow
          key={key}
          name={key}
          value={attributes[key] ?? ""}
          siblingKeys={keys}
          onChange={onChange}
          onRename={onRename}
        />
      ))}
      {keys.length === 0 ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="html-attributes-empty"
        >
          <Trans id="editor.htmlAttrs.none" message="No attributes set." />
        </p>
      ) : null}
      <AddAttr onAdd={onChange} existingKeys={keys} />
    </div>
  );
}

/** One attribute row: an editable name (renamed on commit), the value input,
 *  and a remove button. Keyed by name in the parent, so the draft re-inits when
 *  the row's identity changes. */
function AttrRow({
  name,
  value,
  siblingKeys,
  onChange,
  onRename,
}: {
  readonly name: string;
  readonly value: string;
  readonly siblingKeys: readonly string[];
  readonly onChange: (key: string, value: string | null) => void;
  readonly onRename: (from: string, to: string) => void;
}): ReactElement {
  const [keyDraft, setKeyDraft] = useState(name);

  const commitRename = (): void => {
    // Normalize to lowercase: a mixed-case data-/aria- key passes the allowlist
    // check but React drops it at render, so the editor must store the form the
    // renderer keeps. Collision is checked case-insensitively to match.
    const next = keyDraft.trim().toLowerCase();
    const valid =
      next !== name.toLowerCase() &&
      isAllowedHtmlAttr(next) &&
      !siblingKeys.some((k) => k.toLowerCase() === next);
    if (valid) onRename(name, next);
    else setKeyDraft(name);
  };

  return (
    <div className="flex items-center gap-2" data-testid={`html-attr-${name}`}>
      <Input
        className="h-8 w-1/3 shrink-0"
        data-testid={`html-attr-${name}-key`}
        value={keyDraft}
        onChange={(e) => setKeyDraft(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <Input
        className="h-8"
        data-testid={`html-attr-${name}-value`}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive size-8 shrink-0"
        data-testid={`html-attr-${name}-remove`}
        onClick={() => onChange(name, null)}
      >
        <Trash2 />
        <span className="sr-only">
          <Trans id="editor.htmlAttrs.remove" message="Remove" />
        </span>
      </Button>
    </div>
  );
}

/** Key + value entry row. The key is picked from the common-attribute combobox
 *  or typed; only allowlisted, non-duplicate names with a non-empty value can
 *  be added. */
function AddAttr({
  onAdd,
  existingKeys,
}: {
  readonly onAdd: (key: string, value: string) => void;
  readonly existingKeys: readonly string[];
}): ReactElement {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  // Lowercase throughout: the renderer keeps only the lowercased form (React
  // drops mixed-case data-/aria- props), so the editor offers and stores that.
  const taken = new Set(existingKeys.map((k) => k.toLowerCase()));
  const options = COMMON_ATTRS.filter((attr) => !taken.has(attr));
  const custom = query.trim().toLowerCase();
  const canCreate =
    isAllowedHtmlAttr(custom) &&
    !taken.has(custom) &&
    !COMMON_ATTRS.includes(custom);

  const pick = (attr: string): void => {
    setName(attr);
    setQuery("");
    setOpen(false);
  };

  const valid = name !== "" && !taken.has(name) && value.trim() !== "";

  return (
    <form
      className="flex items-center gap-2 pt-1"
      data-testid="html-attr-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onAdd(name, value);
        setName("");
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
            data-testid="html-attr-add-key"
            className={cn(
              "h-8 w-1/3 shrink-0 justify-between gap-1 font-normal",
              name === "" && "text-muted-foreground",
            )}
          >
            <span className="truncate">
              {name === "" ? (
                <Trans id="editor.htmlAttrs.add.key" message="attribute" />
              ) : (
                name
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
                id: "editor.htmlAttrs.add.search",
                message: "Search attribute…",
              })}
              data-testid="html-attr-add-key-search"
            />
            <CommandList>
              {canCreate ? (
                <CommandItem
                  value={custom}
                  onSelect={() => pick(custom)}
                  data-testid="html-attr-add-key-create"
                >
                  <Plus className="me-2 size-4" />
                  <span className="sr-only">
                    <Trans id="editor.htmlAttrs.add.create" message="Create" />
                  </span>
                  {custom}
                </CommandItem>
              ) : (
                <CommandEmpty>
                  <Trans
                    id="editor.htmlAttrs.add.none"
                    message="No attribute."
                  />
                </CommandEmpty>
              )}
              <CommandGroup>
                {options.map((attr) => (
                  <CommandItem
                    key={attr}
                    value={attr}
                    onSelect={() => pick(attr)}
                    data-testid={`html-attr-add-key-option-${attr}`}
                  >
                    {attr}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        className="h-8"
        data-testid="html-attr-add-value"
        placeholder={i18n._({
          id: "editor.htmlAttrs.add.value",
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
        data-testid="html-attr-add-submit"
      >
        <Plus />
        <span className="sr-only">
          <Trans id="editor.htmlAttrs.add" message="Add attribute" />
        </span>
      </Button>
    </form>
  );
}
