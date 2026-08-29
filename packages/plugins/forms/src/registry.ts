import type { BlockInputOption } from "plumix/blocks";

import type { FormDefinition } from "./define-form.js";
import { FormsError } from "./errors.js";

export interface FormRegistry {
  /**
   * `contributor` is what a slug collision names, so it has to say where
   * the form came from: `"config"` for the plugin's own `forms` array, the
   * plugin id for one registered through `ctx.registerForm`.
   */
  register(form: FormDefinition, contributor: string): void;
  get(slug: string): FormDefinition | undefined;
  /**
   * Empty the registry so one install's contributions do not compound on
   * the last. A plugin descriptor is a value the config loader caches and
   * hands to `installPlugins` more than once in a build — see the call in
   * the plugin's `provides`, which core runs before any `setup`.
   */
  reset(): void;
  /**
   * The block's form picker, as one live array rather than a snapshot.
   * Block inputs are projected into the admin manifest once every
   * plugin's `setup` has run, and a plugin contributing a form may run
   * after this one — so the picker has to be the array the registry keeps
   * appending to, not a copy taken when the block was defined.
   */
  readonly options: readonly BlockInputOption[];
}

interface RegisteredForm {
  readonly form: FormDefinition;
  readonly contributor: string;
}

export function createFormRegistry(): FormRegistry {
  const forms = new Map<string, RegisteredForm>();
  const options: BlockInputOption[] = [];
  return {
    options,
    register: (form, contributor) => {
      const existing = forms.get(form.slug);
      if (existing) {
        throw FormsError.duplicateFormSlug({
          slug: form.slug,
          contributor,
          existingContributor: existing.contributor,
        });
      }
      forms.set(form.slug, { form, contributor });
      options.push({ value: form.slug, label: form.title ?? form.slug });
    },
    get: (slug) => forms.get(slug)?.form,
    reset: () => {
      forms.clear();
      options.length = 0;
    },
  };
}

/**
 * The registry the theme surface reads. `PlumixForm` and `formWire` sit
 * in a theme template, which has no plugin context to reach an install's
 * own registry through — the same bind `@plumix/plugin-menu` solves with
 * a module-scoped location registry.
 *
 * Module scope means one per process rather than one per app, so an
 * install publishes its registry here and the most recent one wins. That
 * is the right answer for a worker, which boots one app per isolate, and
 * it is why only this surface reads it: the block and the submit handler
 * are handed their install's own registry and keep the isolation they
 * have always had.
 */
let published: FormRegistry = createFormRegistry();

export function publishFormRegistry(registry: FormRegistry): void {
  published = registry;
}

export function publishedFormRegistry(): FormRegistry {
  return published;
}
