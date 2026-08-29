import * as v from "valibot";

import { PROGRESS_KEY_PREFIX } from "../contract.js";

/**
 * How far through a wizard a visitor has got: which step they are on,
 * and every answer behind them, urlencoded exactly as the submit would
 * post it. One string rather than a parsed bag — the same shape the
 * server reads a submission from, so restoring progress and reading a
 * body go through one decoder and cannot disagree about what a checked
 * box or an unchosen dropdown means.
 */
export interface FormProgress {
  readonly step: number;
  readonly body: string;
}

// Written by this module and nothing else, and still decoded: session
// storage is the visitor's to edit, and a half-written entry from an
// older release of the plugin is the ordinary case rather than the
// exotic one.
const StoredProgress = v.object({
  step: v.pipe(v.number(), v.integer(), v.minValue(0)),
  body: v.string(),
});

/**
 * Keyed on the form as well as the block node: a node whose slug the
 * editor points at another form would otherwise restore answers keyed to
 * a field list that no longer exists.
 */
export const progressKey = (slug: string, idBase: string): string =>
  `${PROGRESS_KEY_PREFIX}${slug}:${idBase}`;

/**
 * Every touch of session storage goes through here, and every one of
 * them is guarded. A visitor who has blocked site data gets a throw
 * from the property itself in some browsers and from the call in
 * others, and the cost of either is the wizard forgetting a reload —
 * nothing the form needs to work.
 */
function inStorage<T>(read: (storage: Storage) => T): T | undefined {
  try {
    return read(globalThis.sessionStorage);
  } catch {
    return undefined;
  }
}

export function readProgress(key: string): FormProgress | null {
  return (
    inStorage((storage) => {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      const parsed = v.safeParse(StoredProgress, JSON.parse(raw));
      return parsed.success ? parsed.output : null;
    }) ?? null
  );
}

export function writeProgress(key: string, progress: FormProgress): void {
  inStorage((storage) => {
    storage.setItem(key, JSON.stringify(progress));
  });
}

export function clearProgress(key: string): void {
  inStorage((storage) => {
    storage.removeItem(key);
  });
}

/**
 * The answers so far, with what the step on screen says folded in.
 *
 * A step's fields are the only ones in the document, so a submit built
 * from the form element alone would carry that step and lose every
 * other. Merging is by name: a key the current step renders replaces
 * what was stored for it — which is how an answer is corrected on the
 * way back through — and a key it does not render is carried untouched.
 * Every rendered control posts its name, an unticked box and an
 * unchosen dropdown included, so "answered nothing" is distinguishable
 * from "was on another step".
 *
 * An answer a later change hid is carried rather than dropped, and so
 * reaches the server. That is deliberate: the server judges visibility
 * from the same body, so both sides agree about what is hidden, and
 * dropping it here would make them disagree instead. `pickStoredAnswers`
 * is what keeps it out of the row.
 */
export function foldStepAnswers(saved: string, entered: FormData): string {
  const carried = new URLSearchParams(saved);
  const shown = new URLSearchParams();
  for (const [name, value] of entered) {
    if (typeof value === "string") shown.append(name, value);
  }
  for (const name of shown.keys()) carried.delete(name);
  for (const [name, value] of shown) carried.append(name, value);
  return carried.toString();
}
