import { describe, expect, test } from "vitest";

import {
  CfAccessError,
  D1Error,
  R2Error,
  SigV4Error,
  WranglerConfigError,
} from "./errors.js";

describe("D1Error.bindingMissing", () => {
  test("class identity, code, and exposed binding", () => {
    const err = D1Error.bindingMissing({ binding: "MY_DB" });
    expect(err).toBeInstanceOf(D1Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("D1Error");
    expect(err.code).toBe("binding_missing");
    expect(err.binding).toBe("MY_DB");
  });

  test("message interpolates the binding name", () => {
    const err = D1Error.bindingMissing({ binding: "DB" });
    expect(err.message).toContain('D1 binding "DB" missing from env');
  });
});

describe("R2Error.envNotObject", () => {
  test("class identity and code, no binding context", () => {
    const err = R2Error.envNotObject();
    expect(err).toBeInstanceOf(R2Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("R2Error");
    expect(err.code).toBe("env_not_object");
    expect(err.binding).toBeUndefined();
  });

  test("message identifies the failure as a runtime adapter misconfiguration", () => {
    expect(R2Error.envNotObject().message).toContain("env is not an object");
  });
});

describe("R2Error.bindingMissing", () => {
  test("class identity, code, and exposed binding", () => {
    const err = R2Error.bindingMissing({ binding: "MEDIA" });
    expect(err).toBeInstanceOf(R2Error);
    expect(err.name).toBe("R2Error");
    expect(err.code).toBe("binding_missing");
    expect(err.binding).toBe("MEDIA");
  });

  test("message interpolates binding and mentions R2 bucket shape", () => {
    const err = R2Error.bindingMissing({ binding: "MEDIA" });
    expect(err.message).toContain('binding "MEDIA" is missing');
    expect(err.message).toContain("not an R2 bucket");
  });
});

describe("CfAccessError.invalidTeamDomain", () => {
  test("class identity, code, and exposed teamDomain", () => {
    const err = CfAccessError.invalidTeamDomain({ teamDomain: "bogus" });
    expect(err).toBeInstanceOf(CfAccessError);
    expect(err.name).toBe("CfAccessError");
    expect(err.code).toBe("invalid_team_domain");
    expect(err.teamDomain).toBe("bogus");
  });

  test("message mentions teamDomain and the bad value", () => {
    const err = CfAccessError.invalidTeamDomain({ teamDomain: "bogus" });
    expect(err.message).toContain("teamDomain");
    expect(err.message).toContain('"bogus"');
  });
});

describe("CfAccessError.audienceEmpty", () => {
  test("class identity and code", () => {
    const err = CfAccessError.audienceEmpty();
    expect(err).toBeInstanceOf(CfAccessError);
    expect(err.name).toBe("CfAccessError");
    expect(err.code).toBe("audience_empty");
    expect(err.teamDomain).toBeUndefined();
  });

  test("message explains the non-empty requirement", () => {
    expect(CfAccessError.audienceEmpty().message).toContain(
      "audience must be non-empty",
    );
  });
});

describe("SigV4Error.expiresInOutOfRange", () => {
  test("class identity, code, and exposed expiresIn", () => {
    const err = SigV4Error.expiresInOutOfRange({ expiresIn: 0 });
    expect(err).toBeInstanceOf(SigV4Error);
    expect(err.name).toBe("SigV4Error");
    expect(err.code).toBe("expires_in_out_of_range");
    expect(err.expiresIn).toBe(0);
  });

  test("message bakes in the [1..604800] range and includes the bad value", () => {
    const err = SigV4Error.expiresInOutOfRange({ expiresIn: 604_801 });
    expect(err.message).toContain("expiresIn must be in [1..604800]");
    expect(err.message).toContain("604801");
  });

  test("NaN is stringified into the message", () => {
    expect(
      SigV4Error.expiresInOutOfRange({ expiresIn: Number.NaN }).message,
    ).toContain("NaN");
  });
});

describe("WranglerConfigError.parseFailed", () => {
  test("class identity, code, and exposed filename + errorCount", () => {
    const err = WranglerConfigError.parseFailed({
      filename: "wrangler.jsonc",
      errorCount: 2,
    });
    expect(err).toBeInstanceOf(WranglerConfigError);
    expect(err.name).toBe("WranglerConfigError");
    expect(err.code).toBe("parse_failed");
    expect(err.filename).toBe("wrangler.jsonc");
    expect(err.errorCount).toBe(2);
  });

  test("message interpolates filename and error count", () => {
    const err = WranglerConfigError.parseFailed({
      filename: "wrangler.toml",
      errorCount: 3,
    });
    expect(err.message).toContain("Failed to parse wrangler.toml");
    expect(err.message).toContain("3 syntax error(s)");
  });
});
