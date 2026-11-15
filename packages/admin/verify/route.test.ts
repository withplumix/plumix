import { describe, expect, it } from "vitest";

import { redirectOf } from "./route.js";

describe("redirectOf", () => {
  it("names where a page sent the browser when it ended on another route", () => {
    expect(
      redirectOf(
        "/users/create",
        "http://localhost:4000/_plumix/admin/users?page=1&role=all",
      ),
    ).toEqual({ from: "/users/create", to: "/users" });
  });

  it("is undefined when the page added only a query to its route", () => {
    expect(
      redirectOf(
        "/users",
        "http://localhost:4000/_plumix/admin/users?page=1&role=all",
      ),
    ).toBeUndefined();
  });

  it("is undefined when the dashboard stays on the admin's base", () => {
    expect(
      redirectOf("/", "http://localhost:4000/_plumix/admin/"),
    ).toBeUndefined();
  });

  it("is undefined when an alias sends the browser to the page that serves it", () => {
    expect(
      redirectOf(
        "/profile",
        "http://localhost:4000/_plumix/admin/users/7/edit",
      ),
    ).toBeUndefined();
  });

  it("names where an alias sent the browser when that is not the page that serves it", () => {
    expect(
      redirectOf("/profile", "http://localhost:4000/_plumix/admin/"),
    ).toEqual({ from: "/profile", to: "/" });
  });
});
