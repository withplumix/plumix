import * as v from "valibot";

import { PROGRESS_KEY_PREFIX, TURNSTILE_FIELD } from "../contract.js";

/**
 * `body` is urlencoded as the submit posts it, so restoring and reading a
 * submission share one decoder.
 */
export interface FormProgress {
  readonly step: number;
  readonly body: string;
}

// Decoded anyway: the visitor can edit session storage, and an older
// release may have written it.
const StoredProgress = v.object({
  step: v.pipe(v.number(), v.integer(), v.minValue(0)),
  body: v.string(),
});

/**
 * Includes the slug, since an editor can repoint a node at another form.
 */
export const progressKey = (slug: string, idBase: string): string =>
  `${PROGRESS_KEY_PREFIX}${slug}:${idBase}`;

// Blocked site data throws from the property in some browsers and from the
// call in others; losing progress is harmless.
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
 * Keys the current step renders replace stored ones. Hidden answers are
 * deliberately kept: the server judges visibility from the same body.
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

/**
 * For storing: a Turnstile token is single-use, so a restored one would
 * be refused as a duplicate.
 */
export function withoutCaptcha(body: string): string {
  const answers = new URLSearchParams(body);
  answers.delete(TURNSTILE_FIELD);
  return answers.toString();
}
