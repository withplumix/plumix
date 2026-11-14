import { afterEach, describe, expect, test, vi } from "vitest";

import { remoteFetch } from "./remote-fetch.js";

function stubGlobalFetch(
  response: () => Response = () => new Response("ok"),
): Request[] {
  const requests: Request[] = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return Promise.resolve(response());
  });
  return requests;
}

function redirectTo(location: string): () => Response {
  return () => new Response(null, { status: 302, headers: { location } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("remoteFetch", () => {
  test("sends the Access service token when both variables are set", async () => {
    vi.stubEnv("CF_ACCESS_CLIENT_ID", "id.access");
    vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "s3cret");
    const requests = stubGlobalFetch();

    await remoteFetch("https://cms.example/_plumix/api/v1/system/sync/heads", {
      headers: { authorization: "Bearer pl_pat_x" },
    });

    expect(requests[0]?.headers.get("cf-access-client-id")).toBe("id.access");
    expect(requests[0]?.headers.get("cf-access-client-secret")).toBe("s3cret");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer pl_pat_x");
  });

  test.each([
    { id: "id.access", secret: "" },
    { id: "", secret: "s3cret" },
    { id: "", secret: "" },
  ])(
    "sends no Access header unless both variables are set (id $id, secret $secret)",
    async ({ id, secret }) => {
      vi.stubEnv("CF_ACCESS_CLIENT_ID", id);
      vi.stubEnv("CF_ACCESS_CLIENT_SECRET", secret);
      const requests = stubGlobalFetch();

      await remoteFetch("https://cms.example/_plumix/api/v1/system/sync/heads");

      expect(requests[0]?.headers.has("cf-access-client-id")).toBe(false);
      expect(requests[0]?.headers.has("cf-access-client-secret")).toBe(false);
    },
  );

  test("never follows a redirect", async () => {
    const requests = stubGlobalFetch();

    await remoteFetch("https://cms.example/_plumix/auth/device/code", {
      method: "POST",
    });

    expect(requests[0]?.redirect).toBe("manual");
  });

  test("a redirect to the Access login fails with remote_behind_access, naming the site and both variables", async () => {
    stubGlobalFetch(
      redirectTo("https://team.cloudflareaccess.com/cdn-cgi/access/login/x"),
    );

    const fetching = remoteFetch(
      "https://cms.example/_plumix/api/v1/system/sync/heads",
    );

    await expect(fetching).rejects.toMatchObject({
      code: "remote_behind_access",
      message:
        "Cloudflare Access turned away the request to https://cms.example. Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET to an Access service token's client ID and secret.",
    });
  });

  test("a redirect anywhere else is returned as it came", async () => {
    stubGlobalFetch(redirectTo("https://cms.example/sign-in"));

    const response = await remoteFetch(
      "https://cms.example/_plumix/api/v1/system/sync/heads",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://cms.example/sign-in",
    );
  });

  test("a redirect to a host that only contains the Access domain is returned as it came", async () => {
    stubGlobalFetch(
      redirectTo("https://cloudflareaccess.com.evil.example/login"),
    );

    const response = await remoteFetch(
      "https://cms.example/_plumix/api/v1/system/sync/heads",
    );

    expect(response.status).toBe(302);
  });

  test.each([201, 401])(
    "a %i naming the Access login in its Location is returned as it came",
    async (status) => {
      stubGlobalFetch(
        () =>
          new Response(null, {
            status,
            headers: {
              location:
                "https://team.cloudflareaccess.com/cdn-cgi/access/login/x",
            },
          }),
      );

      const response = await remoteFetch(
        "https://cms.example/_plumix/api/v1/system/sync/heads",
      );

      expect(response.status).toBe(status);
    },
  );

  test("a redirect status without a Location is returned as it came", async () => {
    stubGlobalFetch(() => new Response(null, { status: 304 }));

    const response = await remoteFetch(
      "https://cms.example/_plumix/api/v1/system/sync/heads",
    );

    expect(response.status).toBe(304);
  });
});
