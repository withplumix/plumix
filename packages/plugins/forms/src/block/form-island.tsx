"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsLive } from "plumix/blocks/renderer";

import type { FormWire } from "../define-form.js";
import type { FormStep } from "../steps.js";
import type { FormFieldError } from "../types.js";
import type { FormRowState } from "./form-markup.js";
import type { FormProgress } from "./form-progress.js";
import { readSubmittedValues, visibleFields } from "../answers.js";
import { visibleSteps } from "../steps.js";
import { validateAnswers } from "../validate.js";
import {
  postSubmission,
  unreachable,
  useTimingToken,
  withoutNulls,
} from "../wire.js";
import { drawCaptcha, removeCaptcha, resetCaptcha } from "./form-captcha.js";
import { FormMarkup } from "./form-markup.js";
import {
  clearProgress,
  foldStepAnswers,
  progressKey,
  readProgress,
  withoutCaptcha,
  writeProgress,
} from "./form-progress.js";

interface FormIslandProps {
  readonly form: FormWire;
  readonly action: string;
  readonly tokenPath: string;
  readonly idBase: string;
  /** Signed by the server and posted back untouched. */
  readonly bound: string | null;
}

/** Renders the same {@link FormMarkup} the server sent, so it hydrates. */
export function FormIsland({
  form: wire,
  action,
  tokenPath,
  idBase,
  bound,
}: IslandProps<FormIslandProps>): ReactNode {
  const form = useMemo(() => withoutNulls(wire), [wire]);
  const live = useIsLive();
  const [errors, setErrors] = useState<readonly FormFieldError[]>([]);
  const token = useTimingToken(tokenPath);
  const [busy, setBusy] = useState(false);
  // A ref, not `busy`: a double Enter in one tick beats the re-render and
  // would store two rows.
  const inFlight = useRef(false);
  // Which rows each repeater is showing. Empty until the visitor adds or
  // removes one, so the first render is the markup the server sent.
  const [rows, setRows] = useState<FormRowState>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  // Null until the visitor touches the form — which is what keeps the
  // first client render identical to the one the server sent.
  const [entered, setEntered] = useState<FormProgress | null>(null);
  const [moves, setMoves] = useState(0);
  // Counted so each consecutive refusal draws a fresh challenge.
  const [refusals, setRefusals] = useState(0);
  // Undefined with no captcha or a script that never arrived.
  const widget = useRef<string | undefined>(undefined);
  const summary = useRef<HTMLDivElement>(null);
  const confirmed = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // "" for a form with no captcha, whose container is never rendered and
  // whose ref below is therefore never called.
  const siteKey = form.turnstile?.siteKey ?? "";
  const key = progressKey(form.slug, idBase);
  // Not an effect, which would render the blank form then a second
  // render. `live` is false through hydration, so it still matches.
  const saved = useMemo(() => (live ? readProgress(key) : null), [live, key]);
  const progress = entered ?? saved;
  const body = progress?.body ?? "";
  const values = useMemo(
    () => readSubmittedValues(form.fields, new URLSearchParams(body)),
    [form, body],
  );
  // The button's label and its action both read this one list.
  const steps = useMemo(() => visibleSteps(form, values), [form, values]);
  const step = Math.min(progress?.step ?? 0, steps.length - 1);
  const last = steps.length - 1;

  // Every failure sets a fresh array, so a repeat failure moves focus
  // again.
  useEffect(() => {
    if (errors.length > 0) summary.current?.focus();
  }, [errors]);
  useEffect(() => {
    if (confirmation !== null) confirmed.current?.focus();
  }, [confirmation]);
  // Counted, so revisiting a step announces again; a reload's restored
  // step doesn't count, so it doesn't steal focus.
  useEffect(() => {
    if (moves > 0) heading.current?.focus();
  }, [moves]);
  // Out here rather than in `submit`, so a challenge that will not reset
  // cannot be caught as "the submission never reached the server".
  useEffect(() => {
    if (refusals > 0) resetCaptcha(widget.current);
  }, [refusals]);

  // A callback ref, since the container mounts and unmounts on its own
  // with steps and restores.
  const captcha = useCallback(
    (container: HTMLDivElement) => {
      let mounted = true;
      void drawCaptcha(container, siteKey).then((drawn) => {
        if (mounted) widget.current = drawn;
        else removeCaptcha(drawn);
      });
      return () => {
        mounted = false;
        removeCaptcha(widget.current);
        widget.current = undefined;
      };
    },
    [siteKey],
  );

  // Also called on refusal, so a reload after an error keeps the answers.
  function keep(next: FormProgress): void {
    const kept = { ...next, body: withoutCaptcha(next.body) };
    setEntered(kept);
    writeProgress(key, kept);
  }

  // Announces the heading; plain `keep` is for steps the visitor didn't
  // ask for.
  function move(next: FormProgress): void {
    keep(next);
    setMoves((count) => count + 1);
  }

  async function submit(
    posted: string,
    posture: readonly FormStep[],
  ): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const reply = await postSubmission(action, new URLSearchParams(posted));
      if (reply === "unreachable") {
        setErrors(unreachable);
        return;
      }
      if (reply.ok) {
        clearProgress(key);
        setConfirmation(reply.message);
        return;
      }
      const failed = reply.errors;
      setErrors(failed);
      // The server answered, so the challenge it was sent is spent
      // whether or not it was what the answer objected to.
      setRefusals((count) => count + 1);
      // A refused answer may be on an earlier step; show it so the
      // summary links work, judged against the submitted steps.
      const at = posture.findIndex((one) =>
        one.fields.some((field) =>
          failed.some((error) => error.field === field.key),
        ),
      );
      keep({ step: at >= 0 ? at : step, body: posted });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // The answers so far with the step on screen folded in — what every
  // handler below reasons about, and what a reload is given back.
  function folded(element: HTMLFormElement): string {
    return foldStepAnswers(body, new FormData(element));
  }

  // Checks only the visible fields of the current step; the final step is
  // left to the server, which judges every step.
  function forward(element: HTMLFormElement): void {
    const posted = folded(element);
    // Before `live`, the form is the flat server render, whose button
    // submits.
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
      // Uncontrolled inputs read `defaultValue` only at mount, so restored
      // answers need a remount.
      key={saved === null ? "blank" : "restored"}
      form={form}
      action={action}
      idBase={idBase}
      errors={errors}
      answers={progress === null ? undefined : values}
      token={token}
      bound={bound}
      busy={busy}
      summaryRef={summary}
      captchaRef={captcha}
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
