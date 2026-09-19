// Imported from the root `plumix` specifier (not the `plumix/plugin`
// subpath) so the `declare module "plumix"` augmentation below has its
// target loaded — every registry seam merges through that one specifier.
import type { PluginContextExtensions } from "plumix";
import type { Label } from "plumix/i18n";
import {
  definePlugin,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
} from "plumix/plugin";

// Side-effect import: the hook augmentations live beside the code that
// fires them, and this is the edge tsc keeps so they reach a consumer's
// registry (core's `hooks/public-hooks.ts` does the same for its own).
import "./server/hooks.js";

import type { FormDefinition } from "./define-form.js";
import type { FormRegistry } from "./registry.js";
import { createFormBlock } from "./block/form-block.js";
import {
  EXPORT_ROUTE_PATH,
  SUBMISSION_MODERATE_CAPABILITY,
  SUBMISSIONS_PAGE_PATH,
  SUBMISSIONS_SHELL_COMPONENT,
  SUBMIT_ROUTE_PATH,
  TEL_FIELD_COMPONENT,
  TEL_INPUT_TYPE,
  TOKEN_ROUTE_PATH,
} from "./contract.js";
import * as schema from "./db/schema.js";
import { isRetentionPeriod } from "./define-form.js";
import { FormsError } from "./errors.js";
import { createFormRegistry } from "./registry.js";
import { createSubmissionsRouter } from "./rpc.js";
import { createExportHandler } from "./server/export.js";
import { createFormMcpTools } from "./server/mcp-tools.js";
import { purgeExpiredSubmissions, RETENTION_CRON } from "./server/retention.js";
import { createSubmitHandler, tokenHandler } from "./server/submit.js";

export type {
  FormAnswersOf,
  FormBinding,
  FormDefinition,
  FormDefinitionInput,
  FormElementInput,
  FormHandler,
  FormSubmitEvent,
  FormValidateEvent,
  FormValidator,
  FormWire,
  TurnstileConfig,
  TurnstileWire,
} from "./define-form.js";
export { defineForm } from "./define-form.js";
export { formatSubmission } from "./format.js";
export { FormsError } from "./errors.js";
export type { FormPageBreak, FormPageBreakEntry, FormStep } from "./steps.js";
export { pageBreak } from "./steps.js";
// Deliberately re-exported from `contract.ts`, not from the router it
// guards: an oRPC router's inferred type names `@orpc/server` and core's
// schema, and a consumer resolving this entry's `.d.ts` has neither.
export { SUBMISSION_MODERATE_CAPABILITY } from "./contract.js";
export type {
  BoundType,
  FieldLabelSnapshot,
  FormAnswers,
  FormBound,
  FormSummary,
  SubmissionCounts,
  SubmissionDTO,
  SubmissionFilter,
  SubmissionsPage,
  FormFieldError,
  FormLabelSnapshot,
  FormSubmissionCandidate,
  FormSubmitResponse,
  SubmissionStatus,
} from "./types.js";
export { BOUND_TYPES, SUBMISSION_STATUSES } from "./types.js";

// Checked here rather than in the registry: the message has to name the
// site that wrote the number.
function retentionDefault(days: number | undefined): number {
  if (days === undefined) return 0;
  if (!isRetentionPeriod(days)) {
    throw FormsError.invalidDefaultRetention({ retentionDays: days });
  }
  return days;
}

// A plain descriptor literal — plugin source runs server-side without the
// Babel macro pipeline, so the manifest payload is authored by hand.
const SUBMISSIONS_TITLE: Label = {
  id: "plugin.forms.adminPage.title",
  message: "Form submissions",
};

export interface FormsConfig {
  /** The site's own forms. Contributed as `"config"` for slug collisions. */
  readonly forms?: readonly FormDefinition[];
  /**
   * How many days a form that declares no `retentionDays` of its own
   * keeps its submissions for. Nothing by default — indefinitely, the
   * only answer that cannot lose an enquiry nobody asked to lose.
   *
   * It is the one place a site says how long it is entitled to what its
   * forms collect, so a form has to opt out of it rather than into it. A
   * form declaring its own period keeps that one, `0` included. It
   * reaches every registered form, including one another plugin
   * contributed through `registerForm` — a site's retention policy is
   * the site's, not each contributor's.
   */
  readonly retentionDays?: number;
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

  interface AppContextExtensions {
    /**
     * This app's forms, by slug — on the request context because
     * `PlumixForm` renders in a theme template, which can reach nothing
     * else that belongs to one app.
     */
    readonly forms?: Pick<FormRegistry, "get">;
  }
}

type RegisterForm = PluginContextExtensions["registerForm"];

/**
 * Each install's registry, keyed by the `registerForm` its `provides` handed
 * out — core puts that same function on the setup context, which is how
 * `setup` finds its own install's registry.
 */
const registries = new WeakMap<RegisterForm, FormRegistry>();

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
  const defaultRetentionDays = retentionDefault(options.retentionDays);
  return definePlugin("forms", {
    // The chunk the `tel` field renderer is resolved from. Resolved
    // against the consuming site, the way every plugin admin entry is.
    adminEntry: pluginAdminEntryPath("@plumix/plugin-forms"),
    schema,
    // Module specifier `plumix migrate generate` uses to fold this
    // plugin's table into the host's drizzle-kit codegen.
    schemaModule: "@plumix/plugin-forms/schema",
    i18n: PLUGIN_I18N_SLOT,
    provides: (ctx) => {
      // One registry per install rather than per `forms()` call: a
      // descriptor is a value, installed more than once per build and
      // possibly into more than one app. Core runs every `provides` before
      // any `setup`, so a form another plugin contributes lands in it.
      const registry = createFormRegistry(defaultRetentionDays);
      const registerForm: RegisterForm = function registerForm(form) {
        registry.register(form, this.id);
      };
      registries.set(registerForm, registry);
      ctx.extendAppContext("forms", { get: (slug) => registry.get(slug) });
      ctx.extendPluginContext("registerForm", registerForm);
    },
    setup: (ctx) => {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- an identity key, never called
      const registry = registries.get(ctx.registerForm);
      if (registry === undefined) throw FormsError.setupWithoutProvides();
      for (const form of options.forms ?? []) registry.register(form, "config");
      // `tel` is the plugin's own contribution to the field vocabulary,
      // not a core built-in — a form may declare one, and so may any meta
      // box on the site, because the admin resolves the renderer from
      // this registration rather than from the plugin that asked.
      ctx.registerFieldType({
        type: TEL_INPUT_TYPE,
        component: TEL_FIELD_COMPONENT,
      });
      ctx.registerBlock(createFormBlock(registry));
      ctx.registerCapability(SUBMISSION_MODERATE_CAPABILITY, "editor");
      ctx.registerRpcRouter(createSubmissionsRouter(registry));
      for (const tool of createFormMcpTools(registry)) {
        ctx.registerMcpTool(tool);
      }
      ctx.registerAdminPage({
        path: SUBMISSIONS_PAGE_PATH,
        title: SUBMISSIONS_TITLE,
        capability: SUBMISSION_MODERATE_CAPABILITY,
        nav: {
          // Bare-string ref attaches to core's reserved "content" group.
          group: "content",
          label: SUBMISSIONS_TITLE,
          order: 40,
          keywords: [
            { id: "plugin.forms.keyword.forms", message: "forms" },
            { id: "plugin.forms.keyword.submissions", message: "submissions" },
            { id: "plugin.forms.keyword.inbox", message: "inbox" },
          ],
        },
        component: SUBMISSIONS_SHELL_COMPONENT,
      });
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
      ctx.registerRoute({
        method: "GET",
        path: EXPORT_ROUTE_PATH,
        auth: { capability: SUBMISSION_MODERATE_CAPABILITY },
        handler: createExportHandler(),
      });
      ctx.registerRoute({
        method: "GET",
        path: TOKEN_ROUTE_PATH,
        auth: "public",
        handler: tokenHandler,
      });
      // One task for the whole site, registered whether or not a form
      // declares a period today: a plugin contributing a form runs its
      // own `setup` after this one, and the registry is read when the
      // task fires rather than now.
      ctx.registerScheduledTask({
        id: "retention-purge",
        cron: RETENTION_CRON,
        handler: async (appCtx) => {
          const deleted = await purgeExpiredSubmissions(appCtx, registry);
          if (deleted > 0) {
            appCtx.logger.info(
              `[plumix/plugin-forms] retention purge deleted ${String(deleted)} submission${deleted === 1 ? "" : "s"}`,
            );
          }
        },
      });
    },
  });
}
