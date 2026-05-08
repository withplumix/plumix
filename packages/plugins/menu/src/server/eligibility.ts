import type { PluginRegistry } from "@plumix/core";

/**
 * One picker tab in the admin's "Add menu items" rail. The tab label
 * defaults to `labels.plural` for entry types, the taxonomy `label` for
 * term taxonomies, and `menuPicker.tabLabel` for plugin-contributed
 * lookup-adapter kinds. Custom URL is always present as the last tab.
 *
 * `kind` is one of:
 * - `entry`    — links to a `menu_item.meta.kind = 'entry'` ref
 * - `term`     — links to a `menu_item.meta.kind = 'term'` ref
 * - `custom`   — literal URL; always available
 * - other      — plugin-contributed lookup adapter kinds (`media`,
 *                `user`, etc.) that opted in via `menuPicker`
 */
interface PickerTab {
  readonly kind: string;
  readonly tabLabel: string;
  /** For entry/term tabs, the underlying type/taxonomy name. */
  readonly target?: string;
}

/**
 * Pure function over the registered manifest. Returns the ordered list
 * of picker tabs the admin's "Add menu items" rail should render.
 *
 * Eligibility rules:
 * - Entry types: eligible iff `isShownInMenus ?? isPublic ?? true`.
 * - Term taxonomies: same rule against `isShownInMenus ?? isPublic`.
 * - Built-in lookup adapters (`entry`, `term`): NOT enumerated as their
 *   own picker tabs — entry types and term taxonomies above already
 *   surface them per-target. Skipping avoids a redundant "Entries" tab
 *   that lists every entry across every type.
 * - Other lookup adapters (`media`, `user`, plugin-contributed): eligible
 *   iff `menuPicker` is set on the registration.
 * - Custom URL: always last.
 */
export function getEligibleMenuKinds(registry: PluginRegistry): PickerTab[] {
  const tabs: PickerTab[] = [];

  for (const entryType of registry.entryTypes.values()) {
    if (!isMenuEligibleType(entryType)) continue;
    tabs.push({
      kind: "entry",
      tabLabel: pickerLabelForEntryType(entryType),
      target: entryType.name,
    });
  }

  for (const taxonomy of registry.termTaxonomies.values()) {
    if (!isMenuEligibleTaxonomy(taxonomy)) continue;
    tabs.push({
      kind: "term",
      tabLabel: pickerLabelForTaxonomy(taxonomy),
      target: taxonomy.name,
    });
  }

  for (const adapter of registry.lookupAdapters.values()) {
    if (adapter.kind === "entry" || adapter.kind === "term") continue;
    const opt = adapter.menuPicker;
    if (!opt) continue;
    tabs.push({ kind: adapter.kind, tabLabel: opt.tabLabel });
  }

  tabs.push({ kind: "custom", tabLabel: "Custom URL" });
  return tabs;
}

interface MenuEligibleEntryType {
  readonly name: string;
  readonly label: string;
  readonly labels?: { readonly plural?: string };
  readonly isPublic?: boolean;
  readonly isShownInMenus?: boolean;
  readonly menuPickerLabel?: string;
}

function isMenuEligibleType(entryType: MenuEligibleEntryType): boolean {
  return entryType.isShownInMenus ?? entryType.isPublic ?? true;
}

function pickerLabelForEntryType(entryType: MenuEligibleEntryType): string {
  return (
    entryType.menuPickerLabel ?? entryType.labels?.plural ?? entryType.label
  );
}

interface MenuEligibleTaxonomy {
  readonly name: string;
  readonly label: string;
  readonly isPublic?: boolean;
  readonly isShownInMenus?: boolean;
  readonly menuPickerLabel?: string;
}

function isMenuEligibleTaxonomy(taxonomy: MenuEligibleTaxonomy): boolean {
  return taxonomy.isShownInMenus ?? taxonomy.isPublic ?? true;
}

function pickerLabelForTaxonomy(taxonomy: MenuEligibleTaxonomy): string {
  return taxonomy.menuPickerLabel ?? taxonomy.label;
}
