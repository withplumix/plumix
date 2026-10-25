import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  AdminCatalogLocales,
  AdminShippedCatalogs,
  PlumixManifest,
} from "@plumix/core/manifest";
import { projectCatalogLocales } from "@plumix/core";
import { ADMIN_SHIPPED_CATALOGS_FILE } from "@plumix/core/manifest";

/**
 * Projects the manifest's enabled locales onto the catalogs the staged admin
 * ships, so the admin boot reads each catalog by the enabled locale's code.
 */
export async function withAdminCatalogLocales(
  adminDir: string,
  manifest: PlumixManifest,
): Promise<PlumixManifest> {
  const { sourceLocale, catalogs } = JSON.parse(
    await readFile(resolve(adminDir, ADMIN_SHIPPED_CATALOGS_FILE), "utf8"),
  ) as AdminShippedCatalogs;
  const enabled = (manifest.i18n?.locales ?? []).map((locale) => locale.code);
  const project = (shipped: readonly string[]) =>
    projectCatalogLocales(enabled, shipped, sourceLocale);
  const catalogLocales: AdminCatalogLocales = {
    admin: project(catalogs.admin),
    editor: project(catalogs.editor),
    blocks: project(catalogs.blocks),
  };
  return { ...manifest, catalogLocales };
}
