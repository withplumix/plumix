import type { AppContext } from "plumix/plugin";
import { labelSourceText } from "plumix/i18n";
import { withBasePath } from "plumix/support";
import { renderToStaticMarkup } from "react-dom/server";

import type { SubmittedValues } from "../answers.js";
import type { FormDefinition } from "../define-form.js";
import type { FormFieldError } from "../types.js";
import { FormMarkup } from "../block/form-markup.js";
import { SUBMIT_PATH } from "../contract.js";
import { toFormWire } from "../define-form.js";
import { SUMMARY_TITLE } from "../messages.js";

interface RejectedSubmission {
  readonly values: SubmittedValues;
  readonly errors: readonly FormFieldError[];
  readonly returnTo: string | undefined;
  readonly bound: string | null;
}

/**
 * The form alone, without site chrome: the plugin owns the endpoint, not
 * the theme's template.
 */
export function rejectPage(
  ctx: AppContext,
  form: FormDefinition,
  rejected: RejectedSubmission,
): Response {
  const body = renderToStaticMarkup(
    <html lang={ctx.locale.code} dir={ctx.locale.direction}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{labelSourceText(SUMMARY_TITLE)}</title>
      </head>
      <body>
        <main>
          <FormMarkup
            // Projected, not passed: `FormWire` is what a renderer takes,
            // and it is the shape the secret cannot travel on.
            form={toFormWire(form)}
            action={withBasePath(SUBMIT_PATH, ctx.config.basePath)}
            idBase={`plumix-form-${form.slug}`}
            errors={rejected.errors}
            answers={rejected.values}
            bound={rejected.bound}
            returnTo={rejected.returnTo}
          />
        </main>
      </body>
    </html>,
  );
  return new Response(`<!doctype html>${body}`, {
    status: 422,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
