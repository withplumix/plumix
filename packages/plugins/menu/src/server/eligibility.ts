import type { Label } from "plumix/i18n";
import type { PluginRegistry } from "plumix/plugin";
import { labelSourceText } from "plumix/i18n";

interface PickerTab {
  readonly kind: string;
  readonly tabLabel: string;
  readonly target?: string;
}

/**
 * Built-in `entry`/`term` adapters get no tab of their own (types and
 * taxonomies already do); other adapters need `menuPicker`. Custom URL is last.
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
 * Shared by the picker, the item resolver and the public render so they agree
 * on which types are in scope.
 */
export function isMenuEligible(target: {
  readonly isPublic: boolean;
  readonly isShownInMenus?: boolean;
}): boolean {
  return target.isPublic && (target.isShownInMenus ?? true);
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
