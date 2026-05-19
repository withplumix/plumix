import { describe, expect, test } from "vitest";

import { viewportWidthToBucket } from "./viewport-bucket.js";

describe("viewportWidthToBucket", () => {
  test("maps 100% (responsive default) to the large bucket", () => {
    expect(viewportWidthToBucket("100%")).toBe("large");
  });

  test("maps widths up to and including 640 to the small bucket", () => {
    expect(viewportWidthToBucket(320)).toBe("small");
    expect(viewportWidthToBucket(640)).toBe("small");
  });

  test("maps widths between 641 and 991 inclusive to the medium bucket", () => {
    expect(viewportWidthToBucket(641)).toBe("medium");
    expect(viewportWidthToBucket(768)).toBe("medium");
    expect(viewportWidthToBucket(991)).toBe("medium");
  });

  test("maps widths above 991 to the large bucket", () => {
    expect(viewportWidthToBucket(992)).toBe("large");
    expect(viewportWidthToBucket(1440)).toBe("large");
  });
});
