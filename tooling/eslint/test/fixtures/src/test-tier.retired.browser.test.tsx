import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { page } from "vitest/browser";

test("a browser test renders and reads the DOM", () => {
  render(<p />);
  void page;
  expect(document.body).toBeDefined();
  expect(window.localStorage).toBeDefined();
});
