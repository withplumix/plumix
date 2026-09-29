import { isCliError } from "plumix/cli";
import { describe, expect, test } from "vitest";

import { parseDevArgs } from "./dev.js";

function codeThrownBy(run: () => unknown): string | false {
  try {
    run();
  } catch (error) {
    return isCliError(error) && error.code;
  }
  throw new Error("expected a throw");
}

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

  test("rejects a --port that is not a port, in both forms", () => {
    expect(codeThrownBy(() => parseDevArgs(["--port", "abc"]))).toBe(
      "port_flag_out_of_range",
    );
    expect(codeThrownBy(() => parseDevArgs(["--port", "70000"]))).toBe(
      "port_flag_out_of_range",
    );
    expect(codeThrownBy(() => parseDevArgs(["--port=abc"]))).toBe(
      "port_flag_out_of_range",
    );
    expect(codeThrownBy(() => parseDevArgs(["--port="]))).toBe(
      "port_flag_out_of_range",
    );
  });

  test("rejects a --port given no value", () => {
    expect(codeThrownBy(() => parseDevArgs(["--port"]))).toBe(
      "port_flag_missing_value",
    );
  });

  test("extracts --inspector-port followed by a numeric value", () => {
    expect(parseDevArgs(["--inspector-port", "9320"])).toEqual({
      inspectorPort: 9320,
    });
  });

  test("accepts the --inspector-port=N equals form", () => {
    expect(parseDevArgs(["--inspector-port=9320"])).toEqual({
      inspectorPort: 9320,
    });
  });

  test("parses --port and --inspector-port together", () => {
    expect(
      parseDevArgs(["--port", "3020", "--inspector-port", "9320"]),
    ).toEqual({ port: 3020, inspectorPort: 9320 });
    // Reverse order should also work.
    expect(
      parseDevArgs(["--inspector-port", "9320", "--port", "3020"]),
    ).toEqual({ port: 3020, inspectorPort: 9320 });
  });

  test("rejects an --inspector-port that is not a port, in both forms", () => {
    expect(codeThrownBy(() => parseDevArgs(["--inspector-port", "abc"]))).toBe(
      "port_flag_out_of_range",
    );
    expect(codeThrownBy(() => parseDevArgs(["--inspector-port=0"]))).toBe(
      "port_flag_out_of_range",
    );
  });

  test("rejects an --inspector-port given no value", () => {
    expect(codeThrownBy(() => parseDevArgs(["--inspector-port"]))).toBe(
      "port_flag_missing_value",
    );
  });
});
