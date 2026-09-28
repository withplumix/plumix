import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createPluginRpcClient } from "plumix/admin";
import { i18n, I18nProvider } from "plumix/i18n";
import { fakeFile, stubPluginRpc } from "plumix/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { UploadRouter } from "../../test/upload-router.js";
import { MediaLibrary } from "./MediaLibrary.js";

i18n.load({ en: {} });
i18n.activate("en");

// A plugin's admin test renders its component and sends a `File` through a
// stubbed procedure in the same file (#2432): the browser tier's `fetch`,
// `FormData` and `File` all come from the one page, so the multipart body
// oRPC's link builds reaches the stub intact.
let seen: unknown;

beforeEach(() => {
  seen = undefined;
  vi.stubGlobal("plumix", {
    configuredSlots: {
      storage: true,
      imageDelivery: false,
      kv: false,
      cdn: false,
      mailer: false,
    },
  });
  stubPluginRpc<UploadRouter>("media", {
    upload: ({ file }) => {
      seen = file;
      return { size: file.size };
    },
    thumbnail: () => ({
      body: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
        type: "image/png",
      }),
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("an upload test beside a rendered component", () => {
  test("the component renders", async () => {
    stubPluginRpc("media", { list: () => ({ items: [], hasMore: false }) });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <MediaLibrary mode="page" />
        </QueryClientProvider>
      </I18nProvider>,
    );

    expect(
      await screen.findByTestId("media-library-dropzone"),
    ).toBeInTheDocument();
  });

  test("a File sent through a stubbed procedure reaches the responder whole", async () => {
    const rpc = createPluginRpcClient<UploadRouter>("media");

    const result = await rpc.upload({
      file: fakeFile("a.txt", { content: "hello" }),
    });

    expect(seen).toBeInstanceOf(File);
    const file = seen as File;
    expect(file.name).toBe("a.txt");
    expect(file.type).toBe("text/plain");
    expect(await file.text()).toBe("hello");
    expect(result.size).toBe(5);
  });

  test("a Blob the responder returns reaches the caller with its bytes", async () => {
    const rpc = createPluginRpcClient<UploadRouter>("media");

    const { body } = await rpc.thumbnail({ id: 1 });

    expect(body).toBeInstanceOf(Blob);
    expect([...new Uint8Array(await body.arrayBuffer())]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
  });
});
