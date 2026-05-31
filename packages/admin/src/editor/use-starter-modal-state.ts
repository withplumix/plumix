import { useCallback, useState } from "react";

import type { PatternManifestEntry } from "@plumix/core/manifest";

interface UseStarterModalStateOptions {
  readonly initiallyEmpty: boolean;
  readonly candidates: readonly PatternManifestEntry[];
}

interface StarterModalState {
  readonly open: boolean;
  readonly dismiss: () => void;
  readonly reopen: () => void;
}

export function useStarterModalState({
  initiallyEmpty,
  candidates,
}: UseStarterModalStateOptions): StarterModalState {
  const [open, setOpen] = useState(initiallyEmpty && candidates.length > 0);

  const dismiss = useCallback(() => setOpen(false), []);
  const reopen = useCallback(() => {
    if (candidates.length > 0) setOpen(true);
  }, [candidates]);

  return { open, dismiss, reopen };
}
