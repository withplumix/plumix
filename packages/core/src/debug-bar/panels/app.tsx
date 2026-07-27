import type { DebugSnapshot } from "../snapshot.js";
import type { DebugPanel } from "../types.js";
import { DebugKV, DebugSection } from "../primitives.js";

const wired = (on: boolean): string => (on ? "✓" : "—");

const list = (values: readonly string[]): string => values.join(", ") || "—";

/**
 * The App panel: the site's static setup — the same across every page, so it's
 * consolidated into one tab (config, locale, wired slots, installed plugins,
 * and registered content types) rather than a tab each.
 */
export const appPanel: DebugPanel = {
  id: "app",
  title: "App",
  order: 40,
  render: ({ context }: DebugSnapshot) => (
    <>
      <DebugSection title="Config">
        <DebugKV
          rows={[
            { label: "Site name", value: context.siteName ?? "—" },
            { label: "Origin", value: context.origin },
            { label: "Base path", value: context.basePath || "/" },
          ]}
        />
      </DebugSection>
      <DebugSection title="Locale">
        <DebugKV
          rows={[
            { label: "Resolved", value: context.locale.code },
            { label: "Direction", value: context.locale.direction },
          ]}
        />
      </DebugSection>
      <DebugSection title="Slots">
        <DebugKV
          rows={[
            { label: "Cache", value: wired(context.slots.cache) },
            { label: "Storage", value: wired(context.slots.storage) },
            { label: "Mailer", value: wired(context.slots.mailer) },
            { label: "Images", value: wired(context.slots.images) },
          ]}
        />
      </DebugSection>
      <DebugSection title="Plugins">
        <DebugKV
          rows={[{ label: "Installed", value: list(context.plugins.ids) }]}
        />
      </DebugSection>
      <DebugSection title="Content types">
        <DebugKV
          rows={[
            { label: "Entry types", value: list(context.plugins.entryTypes) },
            {
              label: "Taxonomies",
              value: list(context.plugins.termTaxonomies),
            },
          ]}
        />
      </DebugSection>
    </>
  ),
};
