import type { PaletteCommand } from "@/lib/palette-commands.js";
import type { MessageDescriptor } from "@lingui/core";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { findEntryTypeByName } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import {
  getRegisteredPaletteCommands,
  selectCommands,
} from "@/lib/palette-commands.js";
import { paletteNavItems, selectNavItems } from "@/lib/palette-nav.js";
import {
  parseGroupKey,
  resultHref,
  shouldOpenInNewTab,
} from "@/lib/palette-result.js";
import {
  readRecentNav,
  recordRecentNav,
  selectRecentNavItems,
} from "@/lib/recent-nav.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { CoreIcon } from "./core-icon.js";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
const RECENT_LIMIT = 5;

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
  recent: defineMessage({ id: "palette.group.recent", message: "Recent" }),
  commands: defineMessage({
    id: "palette.group.commands",
    message: "Commands",
  }),
  loading: defineMessage({ id: "palette.loading", message: "Searching…" }),
  hintNavigate: defineMessage({
    id: "palette.hint.navigate",
    message: "Navigate",
  }),
  hintSelect: defineMessage({ id: "palette.hint.select", message: "Select" }),
  hintClose: defineMessage({ id: "palette.hint.close", message: "Close" }),
} satisfies Record<string, MessageDescriptor>;

// Built-in commands. Distinct from the Navigation group: these are
// actions/destinations the sidebar doesn't surface (e.g. the current
// user's own profile, reached via the user menu).
const CORE_COMMANDS: readonly PaletteCommand[] = [
  {
    id: "core:profile",
    title: defineMessage({
      id: "palette.command.profile",
      message: "Edit profile",
    }),
    coreIcon: "users",
    run: ({ navigate }) => void navigate({ to: "/profile" }),
  },
  {
    id: "core:settings",
    title: defineMessage({
      id: "palette.command.settings",
      message: "Settings",
    }),
    coreIcon: "settings",
    capability: "settings:manage",
    run: ({ navigate }) => void navigate({ to: "/settings" }),
  },
];

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}

/**
 * Global command palette. Opened with Cmd/Ctrl+K from anywhere in the
 * authenticated admin: filters the sidebar's navigation destinations
 * client-side and shows debounced cross-domain content results from the
 * server, grouped by type. `shouldFilter` is off because content results
 * are already query-matched server-side (they may match on excerpt, not
 * title); navigation is filtered explicitly. RTL is inherited from the
 * app-root `DirectionProvider`.
 */
export function CommandPalette({
  capabilities,
}: {
  readonly capabilities: readonly string[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const renderLabel = useLabel();
  // cmdk's onSelect carries no event; capture the modifier separately.
  const newTabRef = useRef(false);

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

  const trimmed = query.trim();
  const debounced = useDebounced(trimmed, DEBOUNCE_MS);
  const search = useQuery(
    orpc.search.query.queryOptions({
      input: { query: debounced },
      enabled: open && debounced.length >= MIN_QUERY_LENGTH,
    }),
  );

  const commands = selectCommands(
    [...CORE_COMMANDS, ...getRegisteredPaletteCommands()],
    capabilities,
    trimmed,
    renderLabel,
  );
  const navItems = selectNavItems(
    paletteNavItems(capabilities),
    trimmed,
    renderLabel,
  );
  // Drop Recent once typing — the filtered nav group then covers the
  // same destinations.
  const recent =
    open && trimmed.length === 0
      ? selectRecentNavItems(navItems, readRecentNav(), RECENT_LIMIT)
      : [];
  const groups = trimmed.length >= MIN_QUERY_LENGTH ? (search.data ?? []) : [];
  // Suppress the empty state while debouncing/in flight so "no results"
  // doesn't flash before the first response lands.
  const searching =
    trimmed.length >= MIN_QUERY_LENGTH &&
    (trimmed !== debounced || search.isFetching);

  function dismiss(): void {
    setOpen(false);
    setQuery("");
  }

  function goToNav(to: string): void {
    recordRecentNav(to);
    dismiss();
    void navigate({ to });
  }

  // Routes a result to its editor from the group key + id. Each domain
  // owns its route (the server stays admin-route-agnostic).
  function openResult(groupKey: string, id: string): void {
    // Every select pathway (click capture, Enter keydown) writes the ref
    // first, so it's never stale here.
    const newTab = newTabRef.current;
    newTabRef.current = false;
    dismiss();
    if (newTab) {
      const url = resultHref(
        groupKey,
        id,
        (name) => findEntryTypeByName(name)?.adminSlug ?? name,
      );
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const { domain, name } = parseGroupKey(groupKey);
    switch (domain) {
      case "entry": {
        const slug = findEntryTypeByName(name)?.adminSlug ?? name;
        void navigate({
          to: "/entries/$slug/$id/edit",
          params: { slug, id: Number(id) },
        });
        return;
      }
      case "term":
        void navigate({
          to: "/terms/$name/$id/edit",
          params: { name, id: Number(id) },
        });
        return;
      case "users":
        void navigate({ to: "/users/$id/edit", params: { id: Number(id) } });
        return;
    }
  }

  function captureNewTab(
    event: ReactKeyboardEvent | { metaKey: boolean; ctrlKey: boolean },
  ): void {
    newTabRef.current = shouldOpenInNewTab(event);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{renderLabel(M.title)}</DialogTitle>
        <DialogDescription>{renderLabel(M.description)}</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0">
        <Command
          shouldFilter={false}
          onClickCapture={captureNewTab}
          onKeyDown={(event) => {
            if (event.key === "Enter") captureNewTab(event);
          }}
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            data-testid="command-palette-input"
            placeholder={renderLabel(M.placeholder)}
          />
          <CommandList>
            {searching ? (
              <div
                data-testid="command-palette-loading"
                className="text-muted-foreground px-3 py-2 text-sm"
              >
                {renderLabel(M.loading)}
              </div>
            ) : (
              <CommandEmpty>{renderLabel(M.empty)}</CommandEmpty>
            )}
            {recent.length > 0 ? (
              <CommandGroup heading={renderLabel(M.recent)}>
                {recent.map((item) => (
                  <CommandItem
                    key={`recent:${item.to}`}
                    value={`recent:${item.to}`}
                    data-testid={`command-palette-recent-${item.to}`}
                    onSelect={() => {
                      goToNav(item.to);
                    }}
                  >
                    <CoreIcon name={item.coreIcon} />
                    <span>{renderLabel(item.label)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {commands.length > 0 ? (
              <CommandGroup heading={renderLabel(M.commands)}>
                {commands.map((command) => (
                  <CommandItem
                    key={command.id}
                    value={command.id}
                    data-testid={`command-palette-command-${command.id}`}
                    onSelect={() => {
                      dismiss();
                      command.run({ navigate });
                    }}
                  >
                    {command.coreIcon ? (
                      <CoreIcon name={command.coreIcon} />
                    ) : null}
                    <span>{renderLabel(command.title)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {navItems.length > 0 ? (
              <CommandGroup heading={renderLabel(M.navigation)}>
                {navItems.map((item) => (
                  <CommandItem
                    key={item.to}
                    value={item.to}
                    data-testid={`command-palette-nav-${item.to}`}
                    onSelect={() => {
                      goToNav(item.to);
                    }}
                  >
                    <CoreIcon name={item.coreIcon} />
                    <span>{renderLabel(item.label)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {groups.map((group) => (
              <CommandGroup key={group.key} heading={renderLabel(group.label)}>
                {group.items.map((item) => (
                  <CommandItem
                    key={`${group.key}:${item.id}`}
                    value={`${group.key}:${item.id}`}
                    data-testid={`command-palette-result-${group.key}:${item.id}`}
                    onSelect={() => {
                      openResult(group.key, item.id);
                    }}
                  >
                    <span>{item.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div
            data-testid="command-palette-footer"
            className="text-muted-foreground flex items-center gap-4 border-t px-3 py-2 text-xs"
          >
            <span className="flex items-center gap-1">
              <kbd>↑↓</kbd>
              {renderLabel(M.hintNavigate)}
            </span>
            <span className="flex items-center gap-1">
              <kbd>↵</kbd>
              {renderLabel(M.hintSelect)}
            </span>
            <span className="flex items-center gap-1">
              <kbd>⎋</kbd>
              {renderLabel(M.hintClose)}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
