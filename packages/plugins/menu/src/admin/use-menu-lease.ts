import type {
  EditLeaseSession,
  EditLeaseState,
  LeaseRefusal,
} from "plumix/admin";
import { useCallback, useEffect, useRef, useState } from "react";
import { createEditLeaseSession } from "plumix/admin";

import { menuLeaseApi } from "./queries.js";

export interface MenuLease {
  readonly state: EditLeaseState;
  readonly takeOver: () => Promise<void>;
  readonly lose: (refusal: LeaseRefusal) => void;
}

/** Holds the menu's edit lease, which is its term's, while the editor is open. */
export function useMenuLease(termId: number): MenuLease {
  const [state, setState] = useState<EditLeaseState>({ kind: "pending" });
  const session = useRef<EditLeaseSession | null>(null);
  useEffect(() => {
    const current = createEditLeaseSession({
      id: termId,
      api: menuLeaseApi,
      onChange: setState,
    });
    session.current = current;
    current.start();
    return () => current.stop();
  }, [termId]);
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
