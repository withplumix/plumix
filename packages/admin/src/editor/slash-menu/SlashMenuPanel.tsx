import type { ReactElement } from "react";
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { Command as CmdkPrimitive } from "cmdk";

import type { SlashMenuItem } from "./items-from-registry.js";
import { SlashMenuIcon } from "./SlashMenuIcon.js";

export interface SlashMenuPanelHandle {
  /**
   * Tiptap keeps focus in the editor while the slash menu is open, so
   * the suggestion plugin forwards keydown events here. Returns true
   * if the key was consumed (caller should preventDefault), false to
   * bubble back into the editor.
   */
  onKeyDown(event: KeyboardEvent): boolean;
}

interface SlashMenuPanelProps {
  readonly items: readonly SlashMenuItem[];
  readonly query: string;
  readonly onSelect: (item: SlashMenuItem) => void;
  readonly onDismiss: () => void;
}

interface GroupedItem {
  readonly item: SlashMenuItem;
  readonly value: string;
}

/**
 * Slash-menu surface built on the existing shadcn `<Command>` (cmdk)
 * primitives — keeps a11y + styling consistent with `multi-select` and
 * the meta-box reference pickers. cmdk owns filtering (driven by the
 * controlled `value`); the parent owns the editor key bridge.
 */
export const SlashMenuPanel = forwardRef<
  SlashMenuPanelHandle,
  SlashMenuPanelProps
>(function SlashMenuPanel(
  { items, query, onSelect, onDismiss },
  ref,
): ReactElement {
  // cmdk's default filter scores against the item's `value` prop. Pack
  // title + keywords + name into the value so a query against any of
  // them matches without a custom filter implementation.
  const groups = useMemo(() => {
    const buckets = new Map<string, GroupedItem[]>();
    for (const item of items) {
      const value = [item.name, item.title, ...(item.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      const bucket = buckets.get(item.category) ?? [];
      bucket.push({ item, value });
      buckets.set(item.category, bucket);
    }
    return Array.from(buckets, ([category, members]) => ({
      category,
      members,
    }));
  }, [items]);

  const [selectedValue, setSelectedValue] = useState<string>(
    groups[0]?.members[0]?.value ?? "",
  );

  // Mirror the same predicate cmdk uses (`value.includes(search)`)
  // against the joined value the parent builds. Without this the SR
  // announces `items.length` while cmdk's filter has already shrunk
  // the visible list — defeats the live-region's purpose.
  const visibleCount = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return items.length;
    return groups.reduce(
      (total, group) =>
        total +
        group.members.filter(({ value }) => value.includes(needle)).length,
      0,
    );
  }, [groups, items.length, query]);

  // Scoping the key bridge to this panel's own root prevents cross-talk
  // when two editors (e.g., canvas + meta-box richtext field) are open
  // simultaneously — `document.querySelector` would have returned the
  // first match and routed keystrokes to the wrong panel.
  const rootRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Enter":
        case "Escape": {
          const root = rootRef.current;
          if (!root) return false;
          root.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: event.key,
              bubbles: true,
              cancelable: true,
            }),
          );
          if (event.key === "Escape") onDismiss();
          return true;
        }
        default:
          return false;
      }
    },
  }));

  return (
    <Command
      ref={rootRef}
      data-plumix-slash-menu=""
      shouldFilter
      value={selectedValue}
      onValueChange={setSelectedValue}
      filter={(value, search) =>
        value.includes(search.trim().toLowerCase()) ? 1 : 0
      }
      className="w-72 max-w-full border shadow-md"
    >
      {/* Use cmdk's primitive directly — shadcn's `CommandInput`
          wraps the input in a div with a SearchIcon that `sr-only`
          on the input doesn't hide. We just need cmdk's filter
          wire-up; the query comes from Tiptap. */}
      <CmdkPrimitive.Input
        value={query}
        onValueChange={() => {
          /* search is driven by Tiptap's query, not user typing here */
        }}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <div
        data-testid="slash-menu-live-region"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {visibleCount} result{visibleCount === 1 ? "" : "s"}
      </div>
      <CommandList>
        <CommandEmpty data-testid="slash-menu-empty">
          No blocks found
        </CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.category} heading={group.category}>
            {group.members.map(({ item, value }) => (
              <CommandItem
                key={item.name}
                value={value}
                data-testid={`slash-menu-item-${item.name}`}
                onSelect={() => onSelect(item)}
                className="flex items-start gap-2"
              >
                <SlashMenuIcon name={item.icon} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{item.title}</span>
                  {item.description ? (
                    <span className="text-muted-foreground text-xs">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
});
