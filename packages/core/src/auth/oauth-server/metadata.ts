import type { OAuthMetadata } from "@modelcontextprotocol/server";

import type { AppContext } from "../../context/app-context.js";
import { jsonResponse } from "../../runtime/contract/http.js";
import { AUTHORIZE_PATH, issuer, MCP_SCOPES, TOKEN_PATH } from "./urls.js";

/**
 * RFC 8414. Public clients only, known by their Client ID Metadata Document,
 * so there is no registration endpoint and no client secret.
 */
export function handleAuthorizationServerMetadata(ctx: AppContext): Response {
  const base = issuer(ctx);
  const metadata: OAuthMetadata = {
    issuer: base,
    authorization_endpoint: base + AUTHORIZE_PATH,
    token_endpoint: base + TOKEN_PATH,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...MCP_SCOPES],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
  return jsonResponse(metadata);
}
