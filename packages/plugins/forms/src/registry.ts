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
   * Every form registered, in registration order. The inbox's form
   * filter reads this over the plugin's own RPC, so knowing what exists
   * costs neither a table nor a manifest entry.
   */
  list(): readonly FormDefinition[];
  /**
   * The block's form picker, as one live array rather than a snapshot.
   * Block inputs are projected into the admin manifest once every
   * plugin's `setup` has run, and a plugin contributing a form may run
   * after this one — so the picker has to be the array the registry keeps
   * appending to, not a copy taken when the block was defined.
   */
  readonly options: readonly BlockInputOption[];
  /**
   * How long one form's submissions are kept: its own period, or the
   * site's for a form that declares none.
   *
   * The two are separate so that a site can set a period once instead of
   * repeating it on every form, and one form can still keep its own — a
   * newsletter signup outliving an enquiry that carried a home address.
   * `retentionDays: 0` is a declaration, so it wins over a site default
   * rather than reading as the absence of one.
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
