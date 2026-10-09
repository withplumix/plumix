import { describe, expect, it } from "vitest";

import { memoryCdn } from "./memory-cdn.js";

const url = (path: string) => new Request(`https://cms.example${path}`);

describe("memoryCdn", () => {
  it("stores a response under its URL and tags", async () => {
    const { cdn, stored } = memoryCdn();

    await cdn.store?.put(url("/post/hello"), new Response("A"), ["e:1"]);

    expect(stored("/post/hello")).toEqual(["e:1"]);
    expect(await (await cdn.store?.match(url("/post/hello")))?.text()).toBe(
      "A",
    );
  });

  it("answers nothing for a path it never stored", () => {
    const { stored } = memoryCdn();

    expect(stored("/post/hello")).toBeUndefined();
  });

  it("drops every entry carrying a purged tag, and only those", async () => {
    const { cdn, stored } = memoryCdn();
    await cdn.store?.put(url("/a"), new Response("A"), ["t:post", "e:1"]);
    await cdn.store?.put(url("/b"), new Response("B"), ["e:2"]);

    await cdn.purgeTags?.(["e:1"]);

    expect(stored("/a")).toBeUndefined();
    expect(stored("/b")).toEqual(["e:2"]);
  });
});
