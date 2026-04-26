import { describe, expect, test } from "vitest";

import { looksLikeMime } from "./magic-bytes.js";

const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const GIF_HEADER = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00,
]);
const PDF_HEADER = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
]);
const ZIP_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const SVG_TEXT = new TextEncoder().encode(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" />',
);
const PLAIN_TEXT = new TextEncoder().encode("hello world\n");
const WEBP_HEADER = new Uint8Array([
  // RIFF
  0x52, 0x49, 0x46, 0x46,
  // size (any)
  0x00, 0x00, 0x00, 0x00,
  // WEBP
  0x57, 0x45, 0x42, 0x50,
]);

describe("looksLikeMime — accepts matching headers", () => {
  test.each([
    ["image/png", PNG_HEADER],
    ["image/jpeg", JPEG_HEADER],
    ["image/gif", GIF_HEADER],
    ["image/webp", WEBP_HEADER],
    ["image/svg+xml", SVG_TEXT],
    ["application/pdf", PDF_HEADER],
    ["application/zip", ZIP_HEADER],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ZIP_HEADER,
    ],
  ])("%s", (mime, bytes) => {
    expect(looksLikeMime(bytes, mime)).toBe(true);
  });
});

describe("looksLikeMime — rejects mismatched headers", () => {
  test.each([
    ["image/png", PLAIN_TEXT],
    ["image/png", JPEG_HEADER],
    ["image/jpeg", PNG_HEADER],
    ["application/pdf", ZIP_HEADER],
    ["application/zip", PLAIN_TEXT],
    ["image/svg+xml", PLAIN_TEXT],
  ])("%s vs unrelated bytes", (mime, bytes) => {
    expect(looksLikeMime(bytes, mime)).toBe(false);
  });
});

describe("looksLikeMime — accepts plain text payloads for text/* mimes", () => {
  test.each([
    ["text/plain", PLAIN_TEXT],
    ["text/csv", PLAIN_TEXT],
    ["text/markdown", PLAIN_TEXT],
  ])("%s", (mime, bytes) => {
    expect(looksLikeMime(bytes, mime)).toBe(true);
  });
});

describe("looksLikeMime — text/* rejects HTML-shaped payloads (XSS defense)", () => {
  // Authors stash HTML in `.txt` to bypass the image allowlist. The
  // text matcher requires UTF-8 decodable bytes that don't open with
  // common HTML/XML/script markers.
  test.each([
    ["<!DOCTYPE html><html>"],
    ["<html><body>x</body></html>"],
    ["<script>alert(1)</script>"],
    ['<?xml version="1.0"?><svg/>'],
    ["<iframe src='https://evil'></iframe>"],
  ])("%s rejected as text/plain", (payload) => {
    const bytes = new TextEncoder().encode(payload);
    expect(looksLikeMime(bytes, "text/plain")).toBe(false);
  });

  test("non-UTF-8 bytes rejected as text/plain", () => {
    // Lone 0xFF is invalid UTF-8.
    expect(looksLikeMime(new Uint8Array([0xff, 0xd8]), "text/plain")).toBe(
      false,
    );
  });
});

describe("looksLikeMime — accepts when no matcher exists", () => {
  test.each([
    ["application/octet-stream", PLAIN_TEXT], // truly unknown mime
  ])("%s", (mime, bytes) => {
    expect(looksLikeMime(bytes, mime)).toBe(true);
  });
});

test("rejects buffers shorter than the signature", () => {
  expect(looksLikeMime(new Uint8Array([0x89, 0x50]), "image/png")).toBe(false);
});

test("svg detection tolerates BOM + whitespace", () => {
  const text = new TextEncoder().encode("﻿   \n<svg></svg>");
  expect(looksLikeMime(text, "image/svg+xml")).toBe(true);
});
