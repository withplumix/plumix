import { describe, expect, test } from "vitest";

import { parseDevArgs } from "./dev.js";

describe("parseDevArgs", () => {
  test("extracts --port followed by a numeric value", () => {
    expect(parseDevArgs(["--port", "3030"])).toEqual({ port: 3030 });
  });

  test("accepts the --port=N equals form", () => {
    expect(parseDevArgs(["--port=3030"])).toEqual({ port: 3030 });
  });

  test("returns an empty object when --port is absent (vite default)", () => {
    expect(parseDevArgs([])).toEqual({});
    expect(parseDevArgs(["--verbose"])).toEqual({});
  });

  test("throws on a non-numeric --port value", () => {
    expect(() => parseDevArgs(["--port", "abc"])).toThrow(
      /--port.*must be a number/i,
    );
    expect(() => parseDevArgs(["--port="])).toThrow(
      /--port.*must be a number/i,
    );
  });

  test("throws when --port has no value following it", () => {
    expect(() => parseDevArgs(["--port"])).toThrow(/--port.*requires a value/i);
  });
});
