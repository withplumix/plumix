import type { MessageDescriptor } from "@lingui/core";
import { ORPCError } from "@orpc/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  describeRpcError,
  rpcErrorCode,
  rpcErrorReason,
} from "./rpc-errors.js";

const storageMissing: MessageDescriptor = {
  id: "test.storageMissing",
  message: "Storage isn't configured.",
};
const fallback: MessageDescriptor = {
  id: "test.fallback",
  message: "Something went wrong.",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rpcErrorReason / rpcErrorCode", () => {
  test("read the reason and code an ORPCError carries", () => {
    const error = new ORPCError("CONFLICT", {
      data: { reason: "storage_not_configured" },
    });
    expect(rpcErrorReason(error)).toBe("storage_not_configured");
    expect(rpcErrorCode(error)).toBe("CONFLICT");
  });

  test("answer undefined for anything without that shape", () => {
    for (const value of [undefined, null, "CONFLICT", new Error("x"), {}]) {
      expect(rpcErrorReason(value)).toBeUndefined();
      expect(rpcErrorCode(value)).toBeUndefined();
    }
    expect(rpcErrorReason({ data: { reason: 42 } })).toBeUndefined();
    expect(rpcErrorCode({ code: 409 })).toBeUndefined();
  });
});

describe("describeRpcError", () => {
  test("maps the reason to the table's descriptor", () => {
    const error = new ORPCError("CONFLICT", {
      data: { reason: "storage_not_configured" },
    });
    expect(
      describeRpcError(
        error,
        { storage_not_configured: storageMissing },
        fallback,
      ),
    ).toBe(storageMissing);
  });

  test("falls back for an unmapped reason and logs the original error", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new ORPCError("FORBIDDEN", { data: { reason: "other" } });
    expect(
      describeRpcError(
        error,
        { storage_not_configured: storageMissing },
        fallback,
      ),
    ).toBe(fallback);
    expect(log).toHaveBeenCalledWith(error);
  });

  test("never reads the message, even when it matches a table key", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      describeRpcError(
        new Error("storage_not_configured"),
        { storage_not_configured: storageMissing },
        fallback,
      ),
    ).toBe(fallback);
  });

  test("does not treat an inherited property name as a mapped reason", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new ORPCError("CONFLICT", {
      data: { reason: "toString" },
    });
    expect(describeRpcError(error, {}, fallback)).toBe(fallback);
  });
});
