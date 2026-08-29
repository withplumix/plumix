"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { labelSourceText } from "plumix/i18n";
import * as v from "valibot";

import type { FormWire } from "../define-form.js";
import type { FormStep } from "../steps.js";
import type { FormFieldError } from "../types.js";
import type { FormRowState } from "./form-markup.js";
import type { FormProgress } from "./form-progress.js";
import { readSubmittedValues, visibleFields } from "../answers.js";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "../contract.js";
import { UNREACHABLE } from "../messages.js";
import { visibleSteps } from "../steps.js";
import { validateAnswers } from "../validate.js";
import { FormMarkup } from "./form-markup.js";
import {
  clearProgress,
  foldStepAnswers,
  progressKey,
  readProgress,
  writeProgress,
} from "./form-progress.js";
import { SubmitResponse, TokenResponse } from "./schemas.js";

interface FormIslandProps {
  readonly form: FormWire;
  readonly action: string;
  readonly tokenPath: string;
  readonly idBase: string;
}

// It names no field, so the summary reads it as text rather than
// linking nowhere.
const unreachable: readonly FormFieldError[] = [
  { field: "", message: labelSourceText(UNREACHABLE) },
];

/**
 * The definition as it left the server, with the holes JSON punched in it
 * filled back in. Island props cross the wire as JSON, which has no
 * `undefined`: every absent property — a field's `description`, its
 * `visibleWhen`, the form's `title` — arrives as `null`. One pass here is
 * what lets the markup and core's own visibility evaluation read the
 * definition exactly as the server did, rather than every reader down the
 * line learning to spell absence twice.
 */
function withoutNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => withoutNulls(item)) as T;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, withoutNulls(item)]),
  ) as T;
}

// Nothing external to subscribe to: the store never changes, and the two
// snapshots differ only in *where* they are read. It is how a component
// tells "rendered on the server" from "running in a browser" without a
// state update in an effect, which would cascade a second render on every
// island on the page.
const NEVER_CHANGES = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/**
 * The form, upgraded: a submit that does not leave the page, errors
 * rendered against the fields that produced them, rows a visitor can add
 * and remove, a timing token fetched once it mounts, and — where the form
 * declares a page break — one step at a time. It renders the same
 * {@link FormMarkup} the server already sent, so what a visitor without
 * JavaScript keeps working with is the thing this builds on rather than a
 * placeholder it fills in.
 */
export function FormIsland({
  form: wire,
  action,
  tokenPath,
  idBase,
}: IslandProps<FormIslandProps>): ReactNode {
  const form = useMemo(() => withoutNulls(wire), [wire]);
  // False through the server render and the first client render, true
  // once the island is live — so what marks the form enhanced is
  // JavaScript running, not markup that shipped with it. A visitor who
  // never gets this far keeps the plain form and the browser's checks.
  const live = useSyncExternalStore(NEVER_CHANGES, onClient, onServer);
  const [errors, setErrors] = useState<readonly FormFieldError[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Which rows each repeater is showing. Empty until the visitor adds or
  // removes one, so the first render is the markup the server sent.
  const [rows, setRows] = useState<FormRowState>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  // Null until the visitor touches the form — which is what keeps the
  // first client render identical to the one the server sent.
  const [entered, setEntered] = useState<FormProgress | null>(null);
  const [moves, setMoves] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const confirmed = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const key = progressKey(form.slug, idBase);
  // Read once the island is live rather than in an effect: an effect
  // that restored by setting state would render the blank form, then
  // cascade a second render over it. `live` is false through hydration,
  // so the first client render still matches the server's byte for byte.
  const saved = useMemo(() => (live ? readProgress(key) : null), [live, key]);
  const progress = entered ?? saved;
  const body = progress?.body ?? "";
  const values = useMemo(
    () => readSubmittedValues(form.fields, new URLSearchParams(body)),
    [form, body],
  );
  // Everything about the wizard's shape comes from here, and every
  // decision below is taken against this same list — the button's label
  // and what pressing it does are one reading of one set of answers, not
  // two readings that can disagree.
  const steps = useMemo(() => visibleSteps(form, values), [form, values]);
  const step = Math.min(progress?.step ?? 0, steps.length - 1);
  const last = steps.length - 1;

  useEffect(() => {
    const aborter = new AbortController();
    void (async () => {
      try {
        const response = await fetch(tokenPath, {
          headers: { accept: "application/json" },
          signal: aborter.signal,
        });
        const payload = v.safeParse(TokenResponse, await response.json());
        if (payload.success) setToken(payload.output.token);
      } catch {
        // A form that could not get a token still submits: the server
        // treats a submission carrying none as one it cannot time, which
        // is exactly how it treats every no-JavaScript submission.
      }
    })();
    return () => {
      aborter.abort();
    };
  }, [tokenPath]);

  // Focus follows the outcome, so a visitor who cannot see the page is
  // told what happened instead of being left at a button that appeared to
  // do nothing. Every failure sets a fresh array, so a second submit
  // failing the same way moves focus again.
  useEffect(() => {
    if (errors.length > 0) summary.current?.focus();
  }, [errors]);
  useEffect(() => {
    if (confirmation !== null) confirmed.current?.focus();
  }, [confirmation]);
  // Counted rather than watched on the step itself: a visitor who goes
  // back and forward between two steps arrives at one they have already
  // been on, and the announcement is owed to them every time. The count
  // rises only on a step the visitor asked for — never on the one a
  // reload restores, which would take focus off whatever they came back
  // to the page for.
  useEffect(() => {
    if (moves > 0) heading.current?.focus();
  }, [moves]);

  // What the visitor has said, kept where a reload can find it. Called
  // on every step change and on every refusal, so the answers behind a
  // visitor who reloads on seeing an error are the ones they just gave.
  function keep(next: FormProgress): void {
    setEntered(next);
    writeProgress(key, next);
  }

  // A step the visitor asked to be on, whose heading is announced to
  // them. `keep` on its own is for a step they arrive at some other way
  // — see `submit`, which relocates them to a refused answer.
  function move(next: FormProgress): void {
    keep(next);
    setMoves((count) => count + 1);
  }

  async function submit(
    posted: string,
    posture: readonly FormStep[],
  ): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(action, {
        method: "POST",
        headers: {
          accept: "application/json",
          // The header a plain form cannot set. Sending it puts this
          // submission through the ordinary CSRF gate rather than the
          // `formPost` exemption the no-JavaScript path takes.
          [CSRF_HEADER]: CSRF_HEADER_VALUE,
        },
        // A `URLSearchParams` body is sent urlencoded, exactly as the
        // plain form posts it, and sets its own content type.
        body: new URLSearchParams(posted),
      });
      const payload = v.safeParse(SubmitResponse, await response.json());
      if (!payload.success) {
        setErrors(unreachable);
        return;
      }
      if (payload.output.ok) {
        clearProgress(key);
        setConfirmation(payload.output.message);
        return;
      }
      const failed = payload.output.errors;
      setErrors(failed);
      // An answer the server refused may be on a step behind this one —
      // its own step passed, and a later answer revealed the problem.
      // The summary links to controls, so the step holding the first of
      // them has to be the one on screen. Judged against the steps the
      // submission was made from rather than whatever is on screen when
      // it lands. Focus still goes to the summary: the step changed
      // because of the failure, not because the visitor asked to move.
      const at = posture.findIndex((one) =>
        one.fields.some((field) =>
          failed.some((error) => error.field === field.key),
        ),
      );
      keep({ step: at >= 0 ? at : step, body: posted });
    } catch {
      setErrors(unreachable);
    } finally {
      setBusy(false);
    }
  }

  // The answers so far with the step on screen folded in — what every
  // handler below reasons about, and what a reload is given back.
  function folded(element: HTMLFormElement): string {
    return foldStepAnswers(body, new FormData(element));
  }

  /**
   * Forward, from the button that moves the wizard on and from Enter
   * pressed in a field — which is the same button, so the two cannot
   * mean different things. Whether that is a step or a submit is read
   * from `steps`, the list the button's own label came from.
   *
   * The step on screen is checked before the visitor leaves it, against
   * the same rules the server will apply, and only over the fields it
   * actually shows: a question on a later step, or one this step's own
   * answers hide, cannot hold them up here. The final step is left to
   * the server, which judges every step at once.
   */
  function forward(element: HTMLFormElement): void {
    const posted = folded(element);
    // `!live` is the flat form the server sent, whose one button
    // submits — the handler is attached from the first client render,
    // which is a frame before the island is driving anything.
    if (!live || step >= last) {
      void submit(posted, steps);
      return;
    }
    const answers = readSubmittedValues(
      form.fields,
      new URLSearchParams(posted),
    );
    const failures = validateAnswers(
      visibleFields(steps[step]?.fields ?? [], answers),
      answers,
    );
    if (failures.length > 0) {
      setErrors(failures);
      keep({ step, body: posted });
      return;
    }
    setErrors([]);
    move({ step: step + 1, body: posted });
  }

  function back(element: HTMLFormElement | null): void {
    if (element === null) return;
    setErrors([]);
    move({ step: Math.max(0, step - 1), body: folded(element) });
  }

  if (confirmation !== null) {
    return (
      <div
        className="plumix-form-confirmation"
        data-plumix-form-confirmation=""
        role="status"
        tabIndex={-1}
        ref={confirmed}
      >
        {confirmation}
      </div>
    );
  }

  return (
    <FormMarkup
      // Remounts the markup the once, when a reload has answers to put
      // back: the controls are uncontrolled, so `defaultValue` is read
      // at mount and a re-render alone would leave the restored answers
      // out of the document.
      key={saved === null ? "blank" : "restored"}
      form={form}
      action={action}
      idBase={idBase}
      errors={errors}
      answers={progress === null ? undefined : values}
      token={token}
      busy={busy}
      summaryRef={summary}
      enhanced={live}
      step={live ? step : undefined}
      stepHeadingRef={heading}
      rows={rows}
      onRowsChange={
        live
          ? (statePath, ids) => {
              setRows((current) => ({ ...current, [statePath]: ids }));
            }
          : undefined
      }
      onChange={(event) => {
        setEntered({ step, body: folded(event.currentTarget) });
      }}
      onBack={(event) => {
        back(event.currentTarget.form);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        forward(event.currentTarget);
      }}
    />
  );
}
