// Imported from the root `plumix` specifier (not the `plumix/plugin`
// subpath) so the `declare module "plumix"` augmentation below has its
// target loaded — every registry seam merges through that one specifier.
import { definePlugin } from "plumix";

import type { FormDefinition } from "./define-form.js";
import { createFormBlock } from "./block/form-block.js";
import { SUBMIT_ROUTE_PATH } from "./contract.js";
import * as schema from "./db/schema.js";
import { createFormRegistry } from "./registry.js";
import { createSubmitHandler } from "./server/submit.js";

export type { FormDefinition, FormDefinitionInput } from "./define-form.js";
export { defineForm } from "./define-form.js";
export { FormsError } from "./errors.js";
export type {
  FieldLabelSnapshot,
  FormAnswers,
  FormLabelSnapshot,
  SubmissionStatus,
} from "./types.js";
export { SUBMISSION_STATUSES } from "./types.js";

export interface FormsConfig {
  /** The site's own forms. Contributed as `"config"` for slug collisions. */
  readonly forms?: readonly FormDefinition[];
}

declare module "plumix" {
  interface PluginContextExtensions {
    /**
     * Contribute a form from another plugin, so a signup form can be part
     * of what that plugin distributes. Slug collisions throw at boot,
     * naming both contributors — which is why this is a method call on
     * the setup context and not a free function: `this` is how the
     * registry learns which plugin the form came from. So call it on
     * `ctx`: detached, it has no caller to attribute the form to. Both
     * ways to detach one are compile errors — TypeScript rejects
     * `const { registerForm } = ctx`, `unbound-method` rejects
     * `forms.forEach(ctx.registerForm)`.
     */
    registerForm(this: { readonly id: string }, form: FormDefinition): void;
  }
}

/**
 * `@plumix/plugin-forms` — forms declared in code, not stored as rows.
 *
 *     forms({ forms: [defineForm("contact", { fields: [text("name")] })] })
 *
 * A form deploys with the repository that declares it, so local, staging
 * and production cannot drift apart, and a bad change reverts with
 * `git revert`. The block renders it as static markup that submits with
 * JavaScript disabled; the answers land in `form_submissions` with a
 * snapshot of what every field was called at the time.
 */
export function forms(options: FormsConfig = {}) {
  const registry = createFormRegistry();
  return definePlugin("forms", {
    schema,
    // Module specifier `plumix migrate generate` uses to fold this
    // plugin's table into the host's drizzle-kit codegen.
    schemaModule: "@plumix/plugin-forms/schema",
    provides: (ctx) => {
      // Core runs every `provides` before any `setup`, and a descriptor is
      // installed more than once per build (the config loader caches it;
      // the Vite plugin computes the registry from both `emitPlumixSources`
      // and `buildStart`). This is the one point where the registry can be
      // emptied without dropping a form some other plugin's `setup` added.
      registry.reset();
      ctx.extendPluginContext("registerForm", function registerForm(form) {
        registry.register(form, this.id);
      });
    },
    setup: (ctx) => {
      for (const form of options.forms ?? []) registry.register(form, "config");
      ctx.registerBlock(createFormBlock(registry));
      ctx.registerRoute({
        method: "POST",
        path: SUBMIT_ROUTE_PATH,
        auth: "public",
        // A browser cannot set the `X-Plumix-Request` header on an
        // ordinary form submit, so without this there is no no-JavaScript
        // path at all. The Origin check becomes the whole control; the
        // handler reads no session and acts on nobody's behalf.
        formPost: true,
        handler: createSubmitHandler(registry),
      });
    },
  });
}
