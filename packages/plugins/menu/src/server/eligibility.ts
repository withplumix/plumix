import type { Label } from "plumix/i18n";
import type { PluginRegistry } from "plumix/plugin";
import { labelSourceText } from "plumix/i18n";

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
 * - Entry types and term taxonomies: one tab each for those `isMenuEligible`
 *   accepts.
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
    if (!isMenuEligible(entryType)) continue;
    tabs.push({
      kind: "entry",
      tabLabel: pickerLabelForEntryType(entryType),
      target: entryType.name,
    });
  }

  for (const taxonomy of registry.termTaxonomies.values()) {
    if (!isMenuEligible(taxonomy)) continue;
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

/**
 * Whether items of this entry type or term taxonomy belong in a menu. The
 * picker, the editor's item resolver and the public render all ask this, so
 * the three cannot disagree about which types are in scope.
 */
export function isMenuEligible(target: {
  readonly isPublic?: boolean;
  readonly isShownInMenus?: boolean;
}): boolean {
  return target.isShownInMenus ?? target.isPublic ?? true;
}

interface MenuEligibleEntryType {
  readonly name: string;
  readonly label: Label;
  readonly labels?: { readonly plural?: Label };
  readonly menuPickerLabel?: string;
}

function pickerLabelForEntryType(entryType: MenuEligibleEntryType): string {
  return (
    entryType.menuPickerLabel ??
    labelSourceText(entryType.labels?.plural ?? entryType.label)
  );
}

interface MenuEligibleTaxonomy {
  readonly name: string;
  readonly label: Label;
  readonly menuPickerLabel?: string;
}

function pickerLabelForTaxonomy(taxonomy: MenuEligibleTaxonomy): string {
  return taxonomy.menuPickerLabel ?? labelSourceText(taxonomy.label);
}
