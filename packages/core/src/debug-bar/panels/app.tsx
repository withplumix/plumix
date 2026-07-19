import type { AppContext } from "../../context/app.js";
import type { DebugPanel } from "../types.js";
import { DebugKV, DebugSection } from "../primitives.js";

const wired = (slot: unknown): string => (slot ? "✓" : "—");

const list = (values: readonly string[]): string => values.join(", ") || "—";

const keys = (map: ReadonlyMap<string, unknown>): string =>
  list([...map.keys()]);

/**
 * The App panel: the site's static setup — the same across every page, so it's
 * consolidated into one tab (config, locale, wired slots, installed plugins,
 * and registered content types) rather than a tab each.
 */
export const appPanel: DebugPanel = {
  id: "app",
  title: "App",
  order: 40,
  render: (ctx: AppContext) => (
    <>
      <DebugSection title="Config">
        <DebugKV
          rows={[
            { label: "Site name", value: ctx.siteName ?? "—" },
            { label: "Origin", value: ctx.origin },
            { label: "Base path", value: ctx.basePath || "/" },
          ]}
        />
      </DebugSection>
      <DebugSection title="Locale">
        <DebugKV
          rows={[
            { label: "Resolved", value: ctx.locale.code },
            { label: "Direction", value: ctx.locale.direction },
          ]}
        />
      </DebugSection>
      <DebugSection title="Slots">
        <DebugKV
          rows={[
            { label: "Cache", value: wired(ctx.cache) },
            { label: "Storage", value: wired(ctx.storage) },
            { label: "Mailer", value: wired(ctx.mailer) },
            { label: "Images", value: wired(ctx.imageDelivery) },
          ]}
        />
      </DebugSection>
      <DebugSection title="Plugins">
        <DebugKV
          rows={[{ label: "Installed", value: list(ctx.plugins.pluginIds) }]}
        />
      </DebugSection>
      <DebugSection title="Content types">
        <DebugKV
          rows={[
            { label: "Entry types", value: keys(ctx.plugins.entryTypes) },
            { label: "Taxonomies", value: keys(ctx.plugins.termTaxonomies) },
          ]}
        />
      </DebugSection>
    </>
  ),
};
