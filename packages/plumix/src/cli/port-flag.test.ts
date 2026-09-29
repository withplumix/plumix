import { describe, expect, test } from "vitest";

import { isCliError } from "@plumix/core/cli";

import { parsePortFlag } from "./port-flag.js";

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("parsePortFlag", () => {
  test("returns a port from 1 to 65535", () => {
    expect(parsePortFlag("--port", "1")).toBe(1);
    expect(parsePortFlag("--port", "3030")).toBe(3030);
    expect(parsePortFlag("--port", "65535")).toBe(65535);
  });

  test("rejects a flag given no value, naming the flag", () => {
    const error = thrown(() => parsePortFlag("--inspector-port", undefined));
    expect(isCliError(error) && error.code).toBe("port_flag_missing_value");
    expect(isCliError(error) && error.message).toBe(
      "--inspector-port requires a value",
    );
  });

  test.each(["", "abc", "0", "-1", "65536", "3030.5"])(
    "rejects %j as out of range",
    (raw) => {
      const error = thrown(() => parsePortFlag("--port", raw));
      expect(isCliError(error) && error.code).toBe("port_flag_out_of_range");
      expect(isCliError(error) && error.message).toBe(
        `--port value "${raw}" must be a number between 1 and 65535`,
      );
    },
  );
});
