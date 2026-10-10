// Compile-time guard: every registry must augment through the single `plumix`
// specifier, and plugin keys must co-merge with the theme's. Nothing imports
// this; the demo's typecheck checks it.

import type {
  ImageRoleName,
  ReferenceHydrationShapes,
  TemplateDepRegistry,
  ThemeDescriptor,
} from "plumix";
import type {
  ArchiveTypeData,
  ResolvedEntry,
  ResolvedTerm,
} from "plumix/theme";
import { forArchiveType, forEntryType, forTermTaxonomy } from "plumix/theme";

import type { BlockPattern } from "@plumix/core/blocks";
import { block } from "@plumix/core/blocks";

interface GuardArchiveData extends ArchiveTypeData {
  readonly kind: "archiveType";
  readonly name: "guard_archive";
}

declare module "plumix" {
  interface EntryTypeRegistry {
    guard_entry: { entry: ResolvedEntry };
  }
  interface TermTaxonomyRegistry {
    guard_tax: { term: ResolvedTerm };
  }
  interface ArchiveTypeRegistry {
    guard_archive: { data: GuardArchiveData };
  }
  interface TemplateDepRegistry {
    guard_dep: { slug: string; result: number };
  }
  interface BlockTypeRegistry {
    "guard/block": { heading: string };
  }
  interface PatternCategoryRegistry {
    guard_cat: true;
  }
  interface ReferenceHydrationShapes {
    guard_ref: { id: string; label: string };
  }
  interface ImageRoles {
    guard_role: true;
  }
  interface ThemeDescriptor {
    guard_theme_field?: readonly string[];
  }
}

// Theme-side seams: each fails if its augmentation didn't merge into the
// shared symbol the `plumix` API reads.
void forEntryType("guard_entry");
void forTermTaxonomy("guard_tax");
void forArchiveType("guard_archive");
// Negative on purpose: a phantom augmentation falls back to `Record<string,
// unknown>`, accepts the number and leaves the directive unused (TS2578).
// @ts-expect-error -- number is not the merged `heading: string` shape
block("guard/block", { heading: 123 });
void ("guard_cat" satisfies NonNullable<BlockPattern["category"]>);
void ("guard_theme_field" satisfies keyof ThemeDescriptor);

// If the specifier fracture returns, the plugin key drops out and these stop
// compiling.
void ("guard_dep" satisfies keyof TemplateDepRegistry);
void ("menus" satisfies keyof TemplateDepRegistry); // @plumix/plugin-menu
void ("guard_ref" satisfies keyof ReferenceHydrationShapes);
void ("media" satisfies keyof ReferenceHydrationShapes); // @plumix/plugin-media
// `ImageRoleName` is what `.role()` and `registerImageRole` take: core's own
// roles and a theme's augmentation have to land in the one merged interface.
void ("guard_role" satisfies ImageRoleName);
void ("featured" satisfies ImageRoleName); // declared by core
