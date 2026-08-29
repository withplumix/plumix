import type { ReactNode } from "react";

export interface CommentFormError {
  readonly field: string;
  readonly message: string;
}

export interface CommentFormProps {
  /** Where to post. `withBasePath("/_plumix/comments/submit", basePath)`. */
  readonly action: string;
  readonly entryId: number;
  readonly parentId?: number | null;
  /** The page to come back to after a submit. */
  readonly returnTo?: string;
  /** What the visitor typed, when handing a refused submission back. */
  readonly values?: Readonly<Record<string, string>>;
  readonly errors?: readonly CommentFormError[];
  readonly requireEmail?: boolean;
}

function errorFor(
  errors: readonly CommentFormError[] | undefined,
  field: string,
): string | undefined {
  return errors?.find((e) => e.field === field)?.message;
}

/**
 * SPIKE P3 — the comment form as markup the *plugin* owns. This is the
 * whole difference between P2 and P3: once the plugin can render the
 * form, a refused submission can be answered with the form back, the
 * visitor's words still in it, the error against the field that produced
 * it. A theme that wants its own markup keeps writing its own; this is
 * the default the plugin can stand behind.
 */
export function CommentForm({
  action,
  entryId,
  parentId = null,
  returnTo,
  values = {},
  errors,
  requireEmail = true,
}: CommentFormProps): ReactNode {
  const nameError = errorFor(errors, "name");
  const emailError = errorFor(errors, "email");
  const bodyError = errorFor(errors, "body");
  const formError = errorFor(errors, "");
  return (
    <form
      method="post"
      action={action}
      data-testid="comment-form"
      data-plumix-comments-form=""
    >
      {formError ? (
        <p data-testid="comment-form-error" role="alert">
          {formError}
        </p>
      ) : null}
      <input type="hidden" name="entryId" value={String(entryId)} />
      {parentId === null ? null : (
        <input type="hidden" name="parentId" value={String(parentId)} />
      )}
      {returnTo === undefined ? null : (
        <input type="hidden" name="returnTo" value={returnTo} />
      )}
      {/* Honeypot — kept out of the tab order and out of sight, never
          `type="hidden"`, which a bot skips. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px" }}
        defaultValue=""
      />
      <label>
        Name
        <input
          type="text"
          name="name"
          required
          maxLength={120}
          defaultValue={values.name ?? ""}
          aria-invalid={nameError ? true : undefined}
          data-testid="comment-form-name"
        />
      </label>
      {nameError ? (
        <span data-testid="comment-error-name">{nameError}</span>
      ) : null}
      <label>
        Email
        <input
          type="email"
          name="email"
          required={requireEmail}
          maxLength={254}
          defaultValue={values.email ?? ""}
          aria-invalid={emailError ? true : undefined}
          data-testid="comment-form-email"
        />
      </label>
      {emailError ? (
        <span data-testid="comment-error-email">{emailError}</span>
      ) : null}
      <label>
        Comment
        <textarea
          name="body"
          required
          maxLength={10_000}
          defaultValue={values.body ?? ""}
          aria-invalid={bodyError ? true : undefined}
          data-testid="comment-form-body"
        />
      </label>
      {bodyError ? (
        <span data-testid="comment-error-body">{bodyError}</span>
      ) : null}
      <button type="submit" data-testid="comment-form-submit">
        Post comment
      </button>
    </form>
  );
}
