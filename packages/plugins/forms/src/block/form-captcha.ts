import { TURNSTILE_FIELD } from "../contract.js";

/**
 * Cloudflare's widget, as the island drives it.
 *
 * Explicitly rendered, never through the `.cf-turnstile` auto-scan: that
 * scan runs once when the script loads and never again, and an island
 * mounts with `createRoot`, which replaces the markup the server sent —
 * so a widget drawn into the served container is discarded the moment
 * the island takes over, with nothing to draw it a second time. A form
 * broken into steps would never get one at all, since its container only
 * appears when the visitor reaches the step that submits.
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

// `render=explicit` turns the auto-scan off, so nothing can draw a
// second widget into a container this module already owns.
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const api = (): TurnstileApi | undefined =>
  (globalThis as { turnstile?: TurnstileApi }).turnstile;

// One script per document however many guarded forms are on it, and one
// promise so two islands mounting in the same tick cannot each append
// one. Undefined until the first guarded form asks: a page with no
// captcha on it fetches nothing from Cloudflare.
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
    // A blocked or unreachable script resolves to nothing rather than
    // rejecting: the server refuses a submission carrying no challenge
    // on its own, which is the answer the visitor needs either way.
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
 * Draw the challenge again, after the server refused a submission. A
 * token is spent the moment it is verified, so a visitor told to try
 * again would otherwise post the used one and be refused a second time
 * for a reason they were never shown.
 */
export function resetCaptcha(widget: string | undefined): void {
  if (widget !== undefined) api()?.reset(widget);
}

/** Let go of a widget whose container is leaving the page. */
export function removeCaptcha(widget: string | undefined): void {
  if (widget !== undefined) api()?.remove(widget);
}
