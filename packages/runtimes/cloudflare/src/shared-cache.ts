/**
 * The named entrypoint Workers Caching sits in front of. The generated entry
 * defines it, and a site's wrangler config turns its cache on by this name.
 */
export const SHARED_CACHE_ENTRYPOINT = "PlumixSharedCache";

/**
 * Set on what the gateway forwards: core then keeps the universal marker on
 * the response, for the gateway to read and strip.
 */
const GATEWAY_HEADER = "x-plumix-gateway";

/**
 * Cloudflare APO's marketing parameters
 * (https://developers.cloudflare.com/automatic-platform-optimization/reference/query-parameters/),
 * plus Microsoft Ads' `msclkid`. They never change the page, so one copy
 * serves every campaign link.
 */
const MARKETING_PARAMETERS = new Set([
  "ref",
  "fbclid",
  "fb_action_ids",
  "fb_action_types",
  "fb_source",
  "mc_cid",
  "mc_eid",
  "gclid",
  "dclid",
  "msclkid",
  "_ga",
  "campaignid",
  "adgroupid",
  "_ke",
  "cn-reloaded",
  "age-verified",
  "ao_noptimize",
  "usqp",
  "mkt_tok",
  "epik",
  "ck_subscriber_id",
]);

function isMarketingParameter(name: string): boolean {
  return name.startsWith("utm_") || MARKETING_PARAMETERS.has(name);
}

/**
 * What the gateway hands the cached entrypoint. The URL is the cache key, so
 * it drops cookies and marketing parameters and sorts the rest.
 */
export function sharedCacheRequest(request: Request): Request {
  const url = new URL(request.url);
  for (const name of [...url.searchParams.keys()]) {
    if (isMarketingParameter(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
  const forwarded = new Request(url, request);
  forwarded.headers.delete("cookie");
  forwarded.headers.set(GATEWAY_HEADER, "1");
  return forwarded;
}

export function forwardedByGateway(request: Request): boolean {
  return request.headers.has(GATEWAY_HEADER);
}

/** A client's copy of the gateway's header would keep the marker on its page. */
export function visitorRequest(request: Request): Request {
  if (!forwardedByGateway(request)) return request;
  const visitor = new Request(request);
  visitor.headers.delete(GATEWAY_HEADER);
  return visitor;
}
