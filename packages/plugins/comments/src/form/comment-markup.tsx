import type { ComponentProps, ReactNode, Ref } from "react";
import { VISUALLY_HIDDEN_STYLE } from "plumix/blocks/renderer";
import { labelSourceText } from "plumix/i18n";

import type { CommentFormError, CommentFormValues } from "../types.js";
import { HONEYPOT_FIELD, RETURN_FIELD } from "../contract.js";
import {
  BODY_LABEL,
  EMAIL_LABEL,
  NAME_LABEL,
  SUBMIT_LABEL,
  SUMMARY_TITLE,
} from "../messages.js";

export interface CommentMarkupProps {
  /** The submit endpoint, under whatever base path the site is mounted at. */
  readonly action: string;
  readonly entryId: number;
  /** Set when this is the reply box under an existing comment. */
  readonly parentId?: number | null;
  /** The page to come back to once the comment is in. */
  readonly returnTo?: string;
  /**
   * Prefix for every control id, so two forms on one page don't cross-label.
   * Required: a refused comment is re-rendered by a different caller, and a
   * default would change the ids.
   */
  readonly idBase: string;
  readonly requireEmail?: boolean;
  readonly values?: CommentFormValues;
  readonly errors?: readonly CommentFormError[];
  /**
   * Turns native validation off, so a browser bubble can't pre-empt the summary
   * a screen reader is sent to.
   */
  readonly enhanced?: boolean;
  readonly busy?: boolean;
  readonly onSubmit?: ComponentProps<"form">["onSubmit"];
  readonly summaryRef?: Ref<HTMLDivElement>;
}

function ErrorSummary({
  errors,
  idBase,
  ref,
}: {
  readonly errors: readonly CommentFormError[];
  readonly idBase: string;
  readonly ref?: Ref<HTMLDivElement>;
}): ReactNode {
  return (
    <div
      className="plumix-comment-summary"
      data-plumix-comment-summary=""
      role="alert"
      tabIndex={-1}
      ref={ref}
    >
      <h2 className="plumix-comment-summary-title">
        {labelSourceText(SUMMARY_TITLE)}
      </h2>
      <ul className="plumix-comment-summary-list">
        {errors.map((error) => (
          <li key={error.field}>
            {/* A refusal naming no field has no control to send anyone
                to, so it reads as text rather than a link to nowhere. */}
            {error.field === "" ? (
              error.message
            ) : (
              <a href={`#${idBase}-${error.field}`}>{error.message}</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  name,
  label,
  idBase,
  error,
  children,
}: {
  readonly name: string;
  readonly label: string;
  readonly idBase: string;
  readonly error: string | undefined;
  readonly children: (props: {
    readonly id: string;
    readonly name: string;
    readonly "aria-invalid": true | undefined;
    readonly "aria-describedby": string | undefined;
  }) => ReactNode;
}): ReactNode {
  const id = `${idBase}-${name}`;
  const errorId = `${id}-error`;
  return (
    <div className="plumix-comment-field" data-plumix-comment-field={name}>
      <label className="plumix-comment-label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        name,
        "aria-invalid": error === undefined ? undefined : true,
        "aria-describedby": error === undefined ? undefined : errorId,
      })}
      {error === undefined ? null : (
        <p
          className="plumix-comment-error"
          data-plumix-comment-error={name}
          id={errorId}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Owning the markup lets the endpoint hand a refused form back with the
 * visitor's words intact. A theme wanting its own controls uses
 * `usePlumixCommentForm`.
 */
export function CommentMarkup({
  action,
  entryId,
  parentId = null,
  returnTo,
  idBase,
  requireEmail = true,
  values = {},
  errors = [],
  enhanced,
  busy,
  onSubmit,
  summaryRef,
}: CommentMarkupProps): ReactNode {
  const messages = new Map(errors.map((error) => [error.field, error.message]));
  return (
    <form
      className="plumix-comment-form"
      data-plumix-comment-form=""
      data-plumix-comment-form-enhanced={enhanced === true ? "" : undefined}
      method="post"
      action={action}
      noValidate={enhanced === true}
      onSubmit={onSubmit}
    >
      {errors.length > 0 ? (
        <ErrorSummary errors={errors} idBase={idBase} ref={summaryRef} />
      ) : null}
      <input type="hidden" name="entryId" value={entryId} readOnly />
      {parentId === null ? null : (
        <input type="hidden" name="parentId" value={parentId} readOnly />
      )}
      {returnTo === undefined ? null : (
        <input type="hidden" name={RETURN_FIELD} value={returnTo} readOnly />
      )}
      <Field
        name="name"
        label={labelSourceText(NAME_LABEL)}
        idBase={idBase}
        error={messages.get("name")}
      >
        {(control) => (
          <input
            className="plumix-comment-control"
            data-plumix-comment-control="name"
            type="text"
            required
            maxLength={120}
            autoComplete="name"
            defaultValue={values.name ?? ""}
            {...control}
          />
        )}
      </Field>
      <Field
        name="email"
        label={labelSourceText(EMAIL_LABEL)}
        idBase={idBase}
        error={messages.get("email")}
      >
        {(control) => (
          <input
            className="plumix-comment-control"
            data-plumix-comment-control="email"
            type="email"
            required={requireEmail}
            maxLength={254}
            autoComplete="email"
            defaultValue={values.email ?? ""}
            {...control}
          />
        )}
      </Field>
      <Field
        name="body"
        label={labelSourceText(BODY_LABEL)}
        idBase={idBase}
        error={messages.get("body")}
      >
        {(control) => (
          <textarea
            className="plumix-comment-control"
            data-plumix-comment-control="body"
            required
            maxLength={10_000}
            defaultValue={values.body ?? ""}
            {...control}
          />
        )}
      </Field>
      {/* Hidden visually and with `aria-hidden`: a screen-reader user who filled
          the trap would be silently dropped. */}
      <div
        className="plumix-comment-honeypot"
        data-plumix-comment-honeypot=""
        // eslint-disable-next-line shadcn/no-inline-styles -- public markup, where no admin stylesheet loads; core keeps this inline so hiding never depends on a theme's CSS
        style={VISUALLY_HIDDEN_STYLE}
        aria-hidden="true"
      >
        <input
          id={`${idBase}-${HONEYPOT_FIELD}`}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className="plumix-comment-actions" data-plumix-comment-actions="">
        <button
          className="plumix-comment-submit"
          data-plumix-comment-submit=""
          type="submit"
          disabled={busy}
        >
          {labelSourceText(SUBMIT_LABEL)}
        </button>
      </div>
    </form>
  );
}
