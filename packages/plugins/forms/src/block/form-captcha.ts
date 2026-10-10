import { TURNSTILE_FIELD } from "../contract.js";

/**
 * Rendered explicitly: the `.cf-turnstile` auto-scan runs once at script
 * load, and `createRoot` then discards what it drew.
 */
interface TurnstileApi {
  readonly render: (
    container: HTMLElement,
    options: {
      readonly sitekey: string;
      readonly "response-field-name": string;
    },
  ) => string | undefined;
  readonly reset: (widget: string) => void;
  readonly remove: (widget: string) => void;
}

/**
 * `render=explicit` turns the auto-scan off, so nothing can draw a
 * second widget into a container this module already owns.
 */
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const api = (): TurnstileApi | undefined =>
  (globalThis as { turnstile?: TurnstileApi }).turnstile;

/** One promise, so islands mounting in the same tick share one script. */
let script: Promise<TurnstileApi | undefined> | undefined;

function load(): Promise<TurnstileApi | undefined> {
  script ??= new Promise((resolve) => {
    const ready = api();
    if (ready !== undefined) {
      resolve(ready);
      return;
    }
    const element = document.createElement("script");
    element.src = SCRIPT_SRC;
    element.async = true;
    element.addEventListener("load", () => {
      resolve(api());
    });
    // Resolves rather than rejects: the server refuses a submission with
    // no challenge anyway.
    element.addEventListener("error", () => {
      resolve(undefined);
    });
    // `appendChild`, not `append`: a playground typechecking this source
    // alongside `@cloudflare/workers-types` gets that name merged with
    // HTMLRewriter's, whose `append` takes a body rather than a node.
    document.head.appendChild(element);
  });
  return script;
}

/**
 * Draw a challenge in `container` and return the widget's id — what
 * {@link resetCaptcha} and {@link removeCaptcha} take. Undefined where
 * the script never arrived.
 */
export async function drawCaptcha(
  container: HTMLElement,
  siteKey: string,
): Promise<string | undefined> {
  const turnstile = await load();
  return turnstile?.render(container, {
    sitekey: siteKey,
    "response-field-name": TURNSTILE_FIELD,
  });
}

/**
 * Call after the server refuses a submission: a token is spent once
 * verified, so a retry would post a used one.
 */
export function resetCaptcha(widget: string | undefined): void {
  if (widget !== undefined) api()?.reset(widget);
}

/** Let go of a widget whose container is leaving the page. */
export function removeCaptcha(widget: string | undefined): void {
  if (widget !== undefined) api()?.remove(widget);
}
