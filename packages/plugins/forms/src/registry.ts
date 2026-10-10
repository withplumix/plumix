import type { BlockInputOption } from "plumix/blocks";

import type { FormDefinition } from "./define-form.js";
import { FormsError } from "./errors.js";

export interface FormRegistry {
  /** `contributor` is `"config"` or the registering plugin's id. */
  register(form: FormDefinition, contributor: string): void;
  get(slug: string): FormDefinition | undefined;
  /**
   * Every form registered, in registration order. The inbox's form
   * filter reads this over the plugin's own RPC, so knowing what exists
   * costs neither a table nor a manifest entry.
   */
  list(): readonly FormDefinition[];
  /**
   * Live, not a snapshot: forms contributed after the block is defined
   * must still reach the picker.
   */
  readonly options: readonly BlockInputOption[];
  /**
   * The form's own period, else the site's. A form's `0` wins over the
   * site default rather than reading as absent.
   */
  retentionDaysFor(form: FormDefinition): number;
}

interface RegisteredForm {
  readonly form: FormDefinition;
  readonly contributor: string;
}

export function createFormRegistry(defaultRetentionDays = 0): FormRegistry {
  const forms = new Map<string, RegisteredForm>();
  const options: BlockInputOption[] = [];
  return {
    options,
    retentionDaysFor: (form) => form.retentionDays ?? defaultRetentionDays,
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
    list: () => [...forms.values()].map((registered) => registered.form),
  };
}
