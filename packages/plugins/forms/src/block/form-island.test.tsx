// @vitest-environment jsdom
/// <reference lib="dom" />
import type { Mock } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { email } from "plumix/fields";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SUBMIT_PATH, TOKEN_PATH } from "../contract.js";
import { defineForm, toFormWire } from "../define-form.js";
import { FormIsland } from "./form-island.js";

const enquiry = defineForm("enquiry", { fields: [email("email")] });

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

let fetchMock: Mock<Fetch>;

function submits(): number {
  return fetchMock.mock.calls.filter((call) => call[0] === SUBMIT_PATH).length;
}

function mount(): HTMLElement {
  const { container } = render(
    <FormIsland
      form={toFormWire(enquiry)}
      action={SUBMIT_PATH}
      tokenPath={TOKEN_PATH}
      idBase="enquiry"
      bound={null}
    />,
  );
  return container;
}

function formIn(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector("form");
  if (form === null) throw new Error("the island rendered no form");
  return form;
}

beforeEach(() => {
  fetchMock = vi.fn<Fetch>((input) =>
    Promise.resolve(
      input === TOKEN_PATH
        ? json({ token: "t-1" })
        : json({ ok: true, message: "Thanks." }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the form island's submit", () => {
  // `busy` disables the button only once it re-renders; Enter pressed
  // twice in one tick reaches the handler both times.
  test("makes one submission of a form submitted twice in one tick", async () => {
    const container = mount();
    const form = formIn(container);

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        container.querySelector("[data-plumix-form-confirmation]"),
      ).not.toBeNull();
    });
    expect(submits()).toBe(1);
  });

  test("submits again once the first submission has settled", async () => {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        input === TOKEN_PATH
          ? json({ token: "t-1" })
          : json({
              ok: false,
              errors: [{ field: "email", message: "Try another." }],
            }),
      ),
    );
    const container = mount();

    fireEvent.submit(formIn(container));
    await waitFor(() => {
      expect(
        container.querySelector("[data-plumix-form-summary]"),
      ).not.toBeNull();
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => {
      expect(submits()).toBe(2);
    });
  });
});
