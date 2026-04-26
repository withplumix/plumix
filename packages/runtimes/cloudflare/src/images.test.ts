import { describe, expect, test } from "vitest";

import { images } from "./images.js";

describe("images() — Cloudflare Image Transformations URL builder", () => {
  test("returns source URL unchanged when no transform opts are given", () => {
    const cdn = images({ zone: "media.example.com" });
    expect(cdn.url("https://media.example.com/uploads/cat.jpg")).toBe(
      "https://media.example.com/uploads/cat.jpg",
    );
  });

  test("returns source URL unchanged when transform opts are all undefined", () => {
    const cdn = images({ zone: "media.example.com" });
    expect(cdn.url("https://media.example.com/uploads/cat.jpg", {})).toBe(
      "https://media.example.com/uploads/cat.jpg",
    );
  });

  test("emits /cdn-cgi/image URL for a same-zone absolute source", () => {
    const cdn = images({ zone: "media.example.com" });
    expect(
      cdn.url("https://media.example.com/uploads/cat.jpg", { width: 400 }),
    ).toBe("https://media.example.com/cdn-cgi/image/width=400/uploads/cat.jpg");
  });

  test("treats a leading-slash path as same-zone", () => {
    const cdn = images({ zone: "media.example.com" });
    expect(cdn.url("/uploads/cat.jpg", { width: 400 })).toBe(
      "https://media.example.com/cdn-cgi/image/width=400/uploads/cat.jpg",
    );
  });

  test("embeds an external source URL verbatim", () => {
    const cdn = images({ zone: "media.example.com" });
    expect(
      cdn.url("https://images.unsplash.com/photo-1.jpg", { width: 400 }),
    ).toBe(
      "https://media.example.com/cdn-cgi/image/width=400/https://images.unsplash.com/photo-1.jpg",
    );
  });

  test("serialises every supported transform option", () => {
    const cdn = images({ zone: "media.example.com" });
    const url = cdn.url("/cat.jpg", {
      width: 800,
      height: 600,
      fit: "cover",
      quality: 80,
      format: "auto",
      dpr: 2,
    });
    expect(url).toBe(
      "https://media.example.com/cdn-cgi/image/width=800,height=600,fit=cover,quality=80,format=auto,dpr=2/cat.jpg",
    );
  });

  test("strips protocol and trailing slash from zone config", () => {
    const cdn = images({ zone: "https://media.example.com/" });
    expect(cdn.url("/cat.jpg", { width: 100 })).toBe(
      "https://media.example.com/cdn-cgi/image/width=100/cat.jpg",
    );
  });

  test("returned descriptor identifies as cloudflare-images", () => {
    const cdn = images({ zone: "media.example.com" });
    expect(cdn.kind).toBe("cloudflare-images");
  });
});
