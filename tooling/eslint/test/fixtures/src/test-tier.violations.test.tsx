import { screen } from "@testing-library/dom";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { page } from "vitest/browser";

test("renders into a DOM", () => {
  render(<p />);
  void userEvent.setup();
  void screen;
  void page;
  void createRoot;
  expect(document.body).toBeDefined();
  expect(window.location).toBeDefined();
  expect(navigator.language).toBeDefined();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(globalThis.document).toBeDefined();
});
