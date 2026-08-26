// Type-level regression guard for Plumix's public augmentation surface.
//
// Every extensible registry Plumix ships must be augmentable through the
// single public specifier `plumix` (issue #1691). Two failures this file is
// built to catch:
//
//   1. A barrel change drops a registry from the `plumix` surface, so the
//      augmentation goes phantom (or the type import fails).
//   2. Someone reintroduces the specifier fracture: augmenting the same
//      interface via two specifiers (`plumix` vs `plumix/plugin`) makes each
//      view drop the other's keys. The `menus`/`media` assertions below fail
//      if the plugin-contributed keys (registered via `declare module
//      "plumix"` in @plumix/plugin-menu / -media) stop co-merging with the
//      theme-side augmentations here.
//
// Compile-time only: the `declare module` blocks and typed uses have no
// runtime effect, and the `guard_*` fixture names never collide with real
// registered types. Nothing imports this module; it exists to be checked by
// the demo's `typecheck` task in CI (which resolves `plumix` to built dist).

import type {
  CustomArchiveData,
  ReferenceHydrationShapes,
  ResolvedEntry,
  ResolvedTerm,
  TemplateDepRegistry,
  ThemeDescriptor,
} from "plumix";
import { forArchiveType, forEntryType, forTermTaxonomy } from "plumix";

import type { BlockPattern } from "@plumix/blocks";
import { block } from "@plumix/blocks";

interface GuardArchiveData extends CustomArchiveData {
  readonly kind: "custom";
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
  interface ThemeDescriptor {
    guard_theme_field?: readonly string[];
  }
}

// Theme-side seams: each fails if its augmentation didn't merge into the
// shared symbol the `plumix` API reads.
void forEntryType("guard_entry");
void forTermTaxonomy("guard_tax");
void forArchiveType("guard_archive");
// `block`'s attrs narrow via `keyof BlockTypeRegistry`. This must be a negative
// assertion: a merged `guard/block` requires `heading: string`, so the wrong
// type errors and consumes the directive. If the augmentation went phantom,
// `guard/block` would hit the loose `Record<string, unknown>` fallback, accept
// the number, leave the directive unused, and fail typecheck (TS2578).
// @ts-expect-error -- number is not the merged `heading: string` shape
block("guard/block", { heading: 123 });
void ("guard_cat" satisfies NonNullable<BlockPattern["category"]>);
void ("guard_theme_field" satisfies keyof ThemeDescriptor);

// Co-merge assertions: the theme-side `guard_*` key AND a plugin-contributed
// key must both live in the same registry view. If the specifier fracture
// returns, the plugin key drops out and these stop compiling.
void ("guard_dep" satisfies keyof TemplateDepRegistry);
void ("menus" satisfies keyof TemplateDepRegistry); // @plumix/plugin-menu
void ("guard_ref" satisfies keyof ReferenceHydrationShapes);
void ("media" satisfies keyof ReferenceHydrationShapes); // @plumix/plugin-media
