// Own subpath so a site that configures no CDN never carries a vendor's provider.

export type * from "@plumix/core/cdn/cloudflare";
export { cloudflare, CloudflareCdnError } from "@plumix/core/cdn/cloudflare";
