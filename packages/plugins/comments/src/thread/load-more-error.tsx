import type { ReactNode } from "react";

/** Why the last load of older comments failed, if it did. */
export function LoadMoreError({
  error,
}: {
  readonly error: string | null;
}): ReactNode {
  return error === null ? null : (
    <p className="plumix-comment-error" role="alert">
      {error}
    </p>
  );
}
