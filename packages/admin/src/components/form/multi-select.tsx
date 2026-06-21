import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { useLabel } from "@/lib/use-label.js";
import { cn } from "@/lib/utils.js";
import { defineMessage } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Badge } from "@plumix/admin-ui/badge";
import { Button } from "@plumix/admin-ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@plumix/admin-ui/command";
import { Check, ChevronsUpDown } from "@plumix/admin-ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@plumix/admin-ui/popover";

const M = {
  defaultTriggerPlaceholder: defineMessage({
    id: "form.multiSelect.placeholder",
    message: "Select…",
  }),
  defaultSearchPlaceholder: defineMessage({
    id: "form.multiSelect.search",
    message: "Search…",
  }),
  defaultEmpty: defineMessage({
    id: "form.multiSelect.empty",
    message: "No matches.",
  }),
  selectedCount: defineMessage({
    id: "form.multiSelect.selectedCount",
    message: "{count} selected",
    comment: "count: number of selected options in the multi-select",
  }),
} satisfies Record<string, MessageDescriptor>;

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
  /** Indent depth — used to render hierarchical taxonomy term lists. */
  readonly depth?: number;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  className,
  testId,
  disabled = false,
}: {
  readonly options: readonly MultiSelectOption[];
  readonly value: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly emptyText?: string;
  readonly className?: string;
  readonly testId?: string;
  readonly disabled?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const { i18n } = useLingui();
  const renderLabel = useLabel();
  const resolvedPlaceholder =
    placeholder ?? renderLabel(M.defaultTriggerPlaceholder);
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? renderLabel(M.defaultSearchPlaceholder);
  const resolvedEmptyText = emptyText ?? renderLabel(M.defaultEmpty);
  const selected = new Set(value);
  const triggerLabel =
    value.length === 0
      ? resolvedPlaceholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : i18n._(
            M.selectedCount.id,
            { count: value.length },
            { message: M.selectedCount.message },
          );

  const toggle = (optValue: string): void => {
    if (selected.has(optValue)) {
      onChange(value.filter((v) => v !== optValue));
    } else {
      onChange([...value, optValue]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-testid={testId}
          className={cn(
            "justify-between gap-2 font-normal",
            value.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          {value.length > 1 ? (
            <Badge variant="secondary" className="ms-1">
              {value.length}
            </Badge>
          ) : null}
          <ChevronsUpDown className="ms-auto opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={resolvedSearchPlaceholder} />
          <CommandList>
            <CommandEmpty>{resolvedEmptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const checked = selected.has(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.value}`}
                    onSelect={() => {
                      toggle(opt.value);
                    }}
                    data-testid={
                      testId ? `${testId}-option-${opt.value}` : undefined
                    }
                  >
                    <Check
                      className={cn(
                        "me-2 size-4",
                        checked ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span
                      style={
                        opt.depth && opt.depth > 0
                          ? {
                              paddingInlineStart: `${String(opt.depth * 12)}px`,
                            }
                          : undefined
                      }
                    >
                      {opt.label}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
