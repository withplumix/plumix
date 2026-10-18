import type { ReactNode } from "react";

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
