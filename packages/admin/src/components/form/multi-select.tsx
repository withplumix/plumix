import type { ReactNode } from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.js";
import { cn } from "@/lib/utils.js";
import { Check, ChevronsUpDown } from "lucide-react";

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
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
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
  const selected = new Set(value);
  const triggerLabel =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : `${String(value.length)} selected`;

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
            <Badge variant="secondary" className="ml-1">
              {value.length}
            </Badge>
          ) : null}
          <ChevronsUpDown className="ml-auto opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
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
                        "mr-2 size-4",
                        checked ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span
                      style={
                        opt.depth && opt.depth > 0
                          ? { paddingLeft: `${String(opt.depth * 12)}px` }
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
