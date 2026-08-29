import type { AppContext } from "plumix/plugin";
import { withBasePath } from "plumix";
import { labelSourceText } from "plumix/i18n";
import { renderToStaticMarkup } from "react-dom/server";

import type { SubmittedValues } from "../answers.js";
import type { FormDefinition } from "../define-form.js";
import type { FormFieldError } from "../types.js";
import { FormMarkup } from "../block/form-markup.js";
import { SUBMIT_PATH } from "../contract.js";
import { SUMMARY_TITLE } from "../messages.js";

interface RejectedSubmission {
  readonly values: SubmittedValues;
  readonly errors: readonly FormFieldError[];
  readonly returnTo: string | undefined;
  readonly bound: string | null;
}

/**
 * What a visitor with no JavaScript gets when the server will not accept
 * their answers: the same form back, carrying what they typed and the
 * errors against the fields that produced them. A redirect would have
 * lost both and told them nothing.
 *
 * It is the form alone rather than the page it came from — the plugin
 * owns the endpoint, not the theme's template — so it inherits none of
 * the site's chrome. A visitor who gets here has JavaScript off *and* has
 * defeated the browser's own `required` / `type=email` checks, which is
 * rare enough to answer plainly and correctly rather than elaborately.
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
            form={form}
            action={withBasePath(SUBMIT_PATH, ctx.basePath)}
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
