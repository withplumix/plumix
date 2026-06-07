import type { ReactNode } from "react";
import { toast } from "sonner";

// Centralises the data-testid wrapper (selector policy: getByTestId
// only) so every mutation surface emits the same toast shape.
export function toastSuccess(message: ReactNode): void {
  toast.success(<span data-testid="toast-success">{message}</span>);
}

export function toastError(message: ReactNode): void {
  toast.error(<span data-testid="toast-error">{message}</span>);
}
