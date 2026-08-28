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

import type { FormDefinition } from "../define-form.js";
import type { FormFieldError } from "../types.js";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "../contract.js";
import { UNREACHABLE } from "../messages.js";
import { FormMarkup } from "./form-markup.js";
import { SubmitResponse, TokenResponse } from "./schemas.js";

interface FormIslandProps {
  readonly form: FormDefinition;
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
 * rendered against the fields that produced them, and a timing token
 * fetched once it mounts. It renders the same {@link FormMarkup} the
 * server already sent, so what a visitor without JavaScript keeps working
 * with is the thing this builds on rather than a placeholder it fills in.
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
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const confirmed = useRef<HTMLDivElement>(null);

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

  async function submit(element: HTMLFormElement): Promise<void> {
    const body = new URLSearchParams();
    for (const [name, value] of new FormData(element)) {
      if (typeof value === "string") body.append(name, value);
    }

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
        body,
      });
      const payload = v.safeParse(SubmitResponse, await response.json());
      if (!payload.success) {
        setErrors(unreachable);
        return;
      }
      if (payload.output.ok) {
        setConfirmation(payload.output.message);
        return;
      }
      setErrors(payload.output.errors);
    } catch {
      setErrors(unreachable);
    } finally {
      setBusy(false);
    }
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
      form={form}
      action={action}
      idBase={idBase}
      errors={errors}
      token={token}
      busy={busy}
      summaryRef={summary}
      enhanced={live}
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    />
  );
}
