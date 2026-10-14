import type {
  EntryAutosave,
  EntryAutosaveOptions,
} from "@/editor/entry-autosave.js";
import { useEffect, useState } from "react";
import { createEntryAutosave } from "@/editor/entry-autosave.js";
import { orpc } from "@/lib/orpc.js";
import { useQueryClient } from "@tanstack/react-query";

/** Pending writes are also sent on document unload, which runs no unmount. */
export function useEntryAutosave<G extends Record<string, unknown>>(
  options: EntryAutosaveOptions<G>,
): EntryAutosave<G> {
  const queryClient = useQueryClient();
  const [{ autosave, sync, unsaved }] = useState(() =>
    createEntryAutosave(options, queryClient, (input) =>
      orpc.entry.update.call(input),
    ),
  );
  useEffect(() => sync(options));
  useEffect(() => () => void autosave.flush(), [autosave]);
  useEffect(() => {
    // Asking the browser to confirm keeps the page alive while the flush
    // lands; leaving anyway can still drop it, which the prompt warns about.
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!unsaved()) return;
      void autosave.flush();
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [autosave, unsaved]);
  return autosave;
}
