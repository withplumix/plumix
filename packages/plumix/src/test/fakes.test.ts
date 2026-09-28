import { describe, expect, test } from "vitest";

import { fakeFile, fakeImage } from "./fakes.js";

async function bytesOf(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())];
}

describe("fakeFile", () => {
  test("is an empty File named as asked", async () => {
    const file = fakeFile("notes.txt");

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("notes.txt");
    expect(file.size).toBe(0);
    expect(await file.text()).toBe("");
  });

  test("a size fills that many zero bytes", async () => {
    const file = fakeFile("blob.bin", { size: 4 });

    expect(file.size).toBe(4);
    await expect(bytesOf(file)).resolves.toEqual([0, 0, 0, 0]);
  });

  test("content is the file's bytes, and overrides a size", async () => {
    expect(await fakeFile("a.txt", { content: "hello" }).text()).toBe("hello");
    await expect(
      bytesOf(fakeFile("a.bin", { content: new Uint8Array([1, 2, 3]) })),
    ).resolves.toEqual([1, 2, 3]);
    expect(fakeFile("a.txt", { content: "hi", size: 100 }).size).toBe(2);
  });

  test.each([
    ["a.txt", "text/plain"],
    ["a.csv", "text/csv"],
    ["a.json", "application/json"],
    ["a.pdf", "application/pdf"],
    ["a.png", "image/png"],
    ["a.jpg", "image/jpeg"],
    ["a.jpeg", "image/jpeg"],
    ["a.gif", "image/gif"],
    ["a.webp", "image/webp"],
    ["a.svg", "image/svg+xml"],
    ["a.mp3", "audio/mpeg"],
    ["a.mp4", "video/mp4"],
    ["a.zip", "application/zip"],
    ["A.PNG", "image/png"],
  ])("%s is typed %s from its extension", (name, type) => {
    expect(fakeFile(name).type).toBe(type);
  });

  test("an extension outside the table, or none, is application/octet-stream", () => {
    expect(fakeFile("a.heic").type).toBe("application/octet-stream");
    expect(fakeFile("README").type).toBe("application/octet-stream");
  });

  test("an explicit type and lastModified win", () => {
    const file = fakeFile("a.txt", { type: "text/markdown", lastModified: 42 });

    expect(file.type).toBe("text/markdown");
    expect(file.lastModified).toBe(42);
  });
});

describe("fakeImage", () => {
  test("is a PNG File, image.png by default", async () => {
    const image = fakeImage();

    expect(image).toBeInstanceOf(File);
    expect(image.name).toBe("image.png");
    expect(image.type).toBe("image/png");
    await expect(bytesOf(image.slice(0, 8))).resolves.toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  test("its header carries the width and height asked for", async () => {
    const header = new DataView(
      await fakeImage("a.png", { width: 37, height: 21 }).arrayBuffer(),
    );

    expect(header.getUint32(16)).toBe(37);
    expect(header.getUint32(20)).toBe(21);
  });

  test("a name that is not .png throws a TypeError", () => {
    expect(() => fakeImage("photo.jpg")).toThrow(TypeError);
    expect(() => fakeImage("photo.jpg")).toThrow(/PNG/);
  });
});
