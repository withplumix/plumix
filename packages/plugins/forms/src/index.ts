// Imported from the root `plumix` specifier (not the `plumix/plugin`
// subpath) so the `declare module "plumix"` augmentation below has its
// target loaded — every registry seam merges through that one specifier.
import type { PluginContextExtensions } from "plumix";
import type { Label } from "plumix/i18n";
import type { PluginDescriptor } from "plumix/plugin";
import {
  definePlugin,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
} from "plumix/plugin";

// Side-effect import keeps the hook augmentations in the declaration graph.
import "./server/hooks.js";

import type { FormDefinition } from "./define-form.js";
import type { FormRegistry } from "./registry.js";
import type { SubmissionsRouter } from "./rpc.js";
import type {
  FormValidatorRegistration,
  FormValidatorRegistry,
} from "./validators.js";
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
import { createFormValidatorRegistry } from "./validators.js";

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
export type { FormValidatorRegistration } from "./validators.js";

/**
 * Checked here rather than in the registry: the message has to name the
 * site that wrote the number.
 */
function retentionDefault(days: number | undefined): number {
  if (days === undefined) return 0;
  if (!isRetentionPeriod(days)) {
    throw FormsError.invalidDefaultRetention({ retentionDays: days });
  }
  return days;
}

/**
 * A plain descriptor literal — plugin source runs server-side without the
 * Babel macro pipeline, so the manifest payload is authored by hand.
 */
const SUBMISSIONS_TITLE: Label = {
  id: "plugin.forms.adminPage.title",
  message: "Form submissions",
};

export interface FormsConfig {
  /** The site's own forms. Contributed as `"config"` for slug collisions. */
  readonly forms?: readonly FormDefinition[];
  /**
   * For forms with no `retentionDays` of their own, including ones other
   * plugins contribute. Absent keeps submissions indefinitely.
   */
  readonly retentionDays?: number;
}

declare module "plumix" {
  interface PluginContextExtensions {
    /**
     * Call it on `ctx`: `this` names the contributor in a slug-collision
     * error, which throws at boot.
     */
    registerForm(this: { readonly id: string }, form: FormDefinition): void;
    /**
     * Validates submissions across forms, after the plugin's own checks.
     * Two validators with one `id` fail boot.
     */
    registerFormValidator(
      this: { readonly id: string },
      validator: FormValidatorRegistration,
    ): void;
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
type RegisterFormValidator = PluginContextExtensions["registerFormValidator"];

export function forms(
  options: FormsConfig = {},
): PluginDescriptor<
  { registry: FormRegistry; validators: FormValidatorRegistry },
  { readonly forms: SubmissionsRouter }
> {
  const defaultRetentionDays = retentionDefault(options.retentionDays);
  return definePlugin("forms", {
    // The chunk the `tel` field renderer is resolved from. Resolved
    // against the consuming site, the way every plugin admin entry is.
    adminEntry: pluginAdminEntryPath("@plumix/plugin-forms"),
    schema,
    // Module specifier `plumix migrate` resolves to find this package's
    // migration history.
    schemaModule: "@plumix/plugin-forms/schema",
    i18n: PLUGIN_I18N_SLOT,
    // Per install, not per `forms()` call: a descriptor may be installed
    // into more than one app.
    state: () => ({
      registry: createFormRegistry(defaultRetentionDays),
      validators: createFormValidatorRegistry(),
    }),
    provides: (ctx, { registry, validators }) => {
      const registerForm: RegisterForm = function registerForm(form) {
        registry.register(form, this.id);
      };
      ctx.extendAppContext("forms", { get: (slug) => registry.get(slug) });
      ctx.extendPluginContext("registerForm", registerForm);
      const registerFormValidator: RegisterFormValidator =
        function registerFormValidator(validator) {
          validators.register(validator, this.id);
        };
      ctx.extendPluginContext("registerFormValidator", registerFormValidator);
    },
    setup: (ctx, { registry, validators }) => {
      for (const form of options.forms ?? []) registry.register(form, "config");
      // Site-wide: any meta box can use `tel` too.
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
        // A plain form submit can't set `X-Plumix-Request`. Safe because
        // the handler reads no session.
        formPost: true,
        handler: createSubmitHandler(registry, validators),
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
      // Registered unconditionally: contributed forms arrive later, and the
      // registry is read when the task fires.
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
    afterSetup: (_ctx, { registry, validators }) => {
      validators.assertFormsExist(registry);
    },
  });
}
