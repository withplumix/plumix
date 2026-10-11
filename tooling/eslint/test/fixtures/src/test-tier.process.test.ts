import { spawn } from "node:child_process";
import { expect, test } from "vitest";

test("spawns a process", () => {
  expect(typeof spawn).toBe("function");
});
