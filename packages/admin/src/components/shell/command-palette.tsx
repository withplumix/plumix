import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { paletteNavItems } from "@/lib/palette-nav.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { useNavigate } from "@tanstack/react-router";

import { CoreIcon } from "./core-icon.js";

const M = {
  title: defineMessage({ id: "palette.title", message: "Command palette" }),
  description: defineMessage({
    id: "palette.description",
    message: "Search to navigate the admin.",
  }),
  placeholder: defineMessage({ id: "palette.placeholder", message: "Search…" }),
  empty: defineMessage({ id: "palette.empty", message: "No results found." }),
  navigation: defineMessage({
    id: "palette.group.navigation",
    message: "Navigation",
  }),
} satisfies Record<string, MessageDescriptor>;

/**
 * Global command palette. Opened with Cmd/Ctrl+K from anywhere in the
 * authenticated admin; lists capability-filtered navigation destinations
 * (the same source the sidebar renders) and navigates on select. RTL is
 * inherited from the app-root `DirectionProvider`.
 */
export function CommandPalette({
  capabilities,
}: {
  readonly capabilities: readonly string[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const renderLabel = useLabel();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    // eslint-disable-next-line lingui/no-unlocalized-strings -- DOM event name, not UI copy
    document.addEventListener("keydown", onKeyDown);
    return () => {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- DOM event name, not UI copy
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const items = paletteNavItems(capabilities);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={renderLabel(M.title)}
      description={renderLabel(M.description)}
    >
      <CommandInput
        data-testid="command-palette-input"
        placeholder={renderLabel(M.placeholder)}
      />
      <CommandList>
        <CommandEmpty>{renderLabel(M.empty)}</CommandEmpty>
        <CommandGroup heading={renderLabel(M.navigation)}>
          {items.map((item) => (
            <CommandItem
              key={item.to}
              value={renderLabel(item.label)}
              data-testid={`command-palette-nav-${item.to}`}
              onSelect={() => {
                setOpen(false);
                void navigate({ to: item.to });
              }}
            >
              <CoreIcon name={item.coreIcon} />
              <span>{renderLabel(item.label)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
