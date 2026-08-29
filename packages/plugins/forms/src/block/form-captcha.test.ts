import { afterEach, describe, expect, test, vi } from "vitest";

import { TURNSTILE_FIELD } from "../contract.js";
import { drawCaptcha, removeCaptcha, resetCaptcha } from "./form-captcha.js";

const container = {} as HTMLElement;

/** Cloudflare's global, as the widget script publishes it. */
function stubTurnstile(widget: string | undefined = "w1") {
  const api = {
    render: vi.fn(() => widget),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  vi.stubGlobal("turnstile", api);
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("drawCaptcha", () => {
  test("renders the challenge under the name the handler reads", async () => {
    const api = stubTurnstile();

    await expect(drawCaptcha(container, "0x4AAAsite")).resolves.toBe("w1");
    expect(api.render).toHaveBeenCalledWith(container, {
      sitekey: "0x4AAAsite",
      "response-field-name": TURNSTILE_FIELD,
    });
  });
});

describe("resetCaptcha", () => {
  test("draws the challenge again", () => {
    const api = stubTurnstile();

    resetCaptcha("w1");

    expect(api.reset).toHaveBeenCalledWith("w1");
  });

  // Nothing was drawn: the script was blocked, or the form carries no
  // widget at all. Both are ordinary rather than broken.
  test("does nothing for a form carrying no widget", () => {
    const api = stubTurnstile();

    resetCaptcha(undefined);

    expect(api.reset).not.toHaveBeenCalled();
  });

  test("does nothing before the widget script has arrived", () => {
    expect(() => {
      resetCaptcha("w1");
    }).not.toThrow();
  });
});

describe("removeCaptcha", () => {
  test("lets go of a widget whose container is leaving", () => {
    const api = stubTurnstile();

    removeCaptcha("w1");

    expect(api.remove).toHaveBeenCalledWith("w1");
  });
});
