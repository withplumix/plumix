import type { ComponentProps, CSSProperties, ReactNode, Ref } from "react";
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
   * Prefix for every control id, so two forms on one page — the thread's
   * own box and a reply box under a comment — cannot have one form's
   * labels addressing the other's controls. Required rather than
   * defaulted: a refused comment is handed back by a different caller
   * than rendered it, and a default would give the returned form
   * different ids from the one the visitor filled in.
   */
  readonly idBase: string;
  readonly requireEmail?: boolean;
  readonly values?: CommentFormValues;
  readonly errors?: readonly CommentFormError[];
  /**
   * Set by the island. It turns the browser's own validation off, because
   * the island checks nothing the server does not and a native bubble
   * would pre-empt the summary a screen reader is sent to.
   */
  readonly enhanced?: boolean;
  readonly busy?: boolean;
  readonly onSubmit?: ComponentProps<"form">["onSubmit"];
  readonly summaryRef?: Ref<HTMLDivElement>;
}

// The one piece of styling the plugin cannot leave to the theme: a trap
// the visitor can see is a trap they fill in. Inline rather than in a
// stylesheet so hiding it never depends on a file the page didn't load.
// `aria-hidden` on the wrapper is the other half — this is the `.sr-only`
// recipe, which keeps content in the accessibility tree by design, and a
// screen-reader user who filled the trap would be silently dropped.
const HONEYPOT_STYLE: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

/** Every refusal at the top, each a link to the control that produced it. */
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

/** One labelled control, with its refusal wired to it by id. */
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
 * The comment form, as markup the plugin owns.
 *
 * That ownership is the whole reason this exists. A plugin that renders no
 * form can only answer a refused submission with a redirect or a bare
 * page, and either way the visitor loses what they typed; owning the
 * markup is what lets the endpoint hand the form back with their words
 * still in it. It is also what the island upgrades in place — the same
 * elements, the same endpoint — so a visitor without JavaScript keeps the
 * thing the enhancement builds on rather than a placeholder.
 *
 * A theme that wants its own controls writes them and calls
 * `usePlumixCommentForm` instead; this is the default the plugin can stand
 * behind.
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
      <div
        className="plumix-comment-honeypot"
        data-plumix-comment-honeypot=""
        style={HONEYPOT_STYLE}
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
