import { describe, expect, test } from "vitest";

import {
  injectManifestIntoHtml,
  serializeManifestScript,
} from "./manifest-script.js";
import { emptyManifest, MANIFEST_SCRIPT_ID } from "./manifest-types.js";

describe("serializeManifestScript", () => {
  test("emits a json script tag with the expected id", () => {
    const tag = serializeManifestScript({
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          label: "Posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
        },
      ],
    });
    expect(tag).toContain(`id="${MANIFEST_SCRIPT_ID}"`);
    expect(tag).toContain(`type="application/json"`);
    expect(tag).toContain(
      `{"entryTypes":[{"name":"post","capabilityType":"post","adminSlug":"posts","label":"Posts","isPublic":true,"showUI":true,"showInSidebar":true}]}`,
    );
  });

  test("neutralises </ sequences in payload so the tag can't be broken out of", () => {
    const tag = serializeManifestScript({
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          label: "</script><b>x</b>",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
        },
      ],
    });
    expect(tag).not.toContain("</script><b>");
    expect(tag).toMatch(/<\\\/script>/);
  });

  test("round-trips through JSON.parse after unescaping the slash", () => {
    const manifest = {
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          label: "x</y>",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
        },
      ],
    };
    const tag = serializeManifestScript(manifest);
    const prefix = `<script id="${MANIFEST_SCRIPT_ID}" type="application/json">`;
    const suffix = `</script>`;
    expect(tag.startsWith(prefix)).toBe(true);
    expect(tag.endsWith(suffix)).toBe(true);
    const payload = tag.slice(prefix.length, -suffix.length);
    expect(JSON.parse(payload.replaceAll("<\\/", "</"))).toEqual(manifest);
  });
});

describe("injectManifestIntoHtml", () => {
  const TEMPLATE = `<!doctype html><html><body>
<div id="root"></div>
<script id="plumix-manifest" type="application/json">{"entryTypes":[]}</script>
<script type="module" src="/src/main.tsx"></script>
</body></html>`;

  test("replaces the placeholder with the serialised manifest", () => {
    const out = injectManifestIntoHtml(TEMPLATE, {
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          label: "Posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
        },
      ],
    });
    expect(out).toContain(
      `{"entryTypes":[{"name":"post","capabilityType":"post","adminSlug":"posts","label":"Posts","isPublic":true,"showUI":true,"showInSidebar":true}]}`,
    );
    expect(out).not.toContain(`{"entryTypes":[]}`);
  });

  test("is idempotent when the manifest is already injected", () => {
    const manifest = {
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          label: "Posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
        },
      ],
    };
    const once = injectManifestIntoHtml(TEMPLATE, manifest);
    const twice = injectManifestIntoHtml(once, manifest);
    expect(twice).toBe(once);
  });

  test("throws when the placeholder tag is missing", () => {
    expect(() =>
      injectManifestIntoHtml("<!doctype html><html></html>", emptyManifest()),
    ).toThrow(/placeholder/);
  });

  test("preserves surrounding script tags", () => {
    const out = injectManifestIntoHtml(TEMPLATE, emptyManifest());
    expect(out).toContain(`<script type="module" src="/src/main.tsx">`);
    expect(out).toContain(`<div id="root"></div>`);
  });

  test("matches uppercase SCRIPT tags (minifier-agnostic)", () => {
    const html = `<SCRIPT ID="plumix-manifest" TYPE="application/json">{"entryTypes":[]}</SCRIPT>`;
    const out = injectManifestIntoHtml(html, {
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          label: "Posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
        },
      ],
    });
    expect(out).toContain(
      `{"entryTypes":[{"name":"post","capabilityType":"post","adminSlug":"posts","label":"Posts","isPublic":true,"showUI":true,"showInSidebar":true}]}`,
    );
  });

  test("tolerates whitespace inside the placeholder body", () => {
    const html = `<script id="plumix-manifest" type="application/json">
      { "entryTypes": [] }
    </script>`;
    const out = injectManifestIntoHtml(html, {
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          label: "Posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
        },
      ],
    });
    expect(out).toMatch(
      /^<script id="plumix-manifest" type="application\/json">\{"entryTypes":\[\{"name":"post","capabilityType":"post","adminSlug":"posts","label":"Posts","isPublic":true,"showUI":true,"showInSidebar":true\}\]}<\/script>$/,
    );
  });
});
