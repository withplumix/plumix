import type {
  EditLeaseSession,
  EditLeaseState,
  LeaseRefusal,
} from "@/editor/edit-lease.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { createEditLeaseSession } from "@/editor/edit-lease.js";
import { orpc } from "@/lib/orpc.js";

export interface EditLease {
  readonly state: EditLeaseState;
  readonly takeOver: () => Promise<void>;
  readonly lose: (refusal: LeaseRefusal) => void;
}

/** Holds the entry's edit lease while the editor is open. */
export function useEditLease(id: number): EditLease {
  const [state, setState] = useState<EditLeaseState>({ kind: "pending" });
  const session = useRef<EditLeaseSession | null>(null);
  useEffect(() => {
    const current = createEditLeaseSession({
      id,
      api: {
        acquire: (input) => orpc.entry.lease.acquire.call(input),
        renew: (input) => orpc.entry.lease.renew.call(input),
        release: (input) => orpc.entry.lease.release.call(input),
      },
      onChange: setState,
    });
    session.current = current;
    current.start();
    return () => current.stop();
  }, [id]);
  const takeOver = useCallback(
    () => session.current?.takeOver() ?? Promise.resolve(),
    [],
  );
  const lose = useCallback(
    (refusal: LeaseRefusal) => session.current?.lose(refusal),
    [],
  );
  return { state, takeOver, lose };
}
