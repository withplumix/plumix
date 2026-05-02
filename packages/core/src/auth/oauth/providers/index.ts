import type { OAuthProvider, OAuthProviderKey } from "../types.js";
import { fetchPrimaryEmail, github } from "./github.js";
import { google } from "./google.js";

export { github, google, fetchPrimaryEmail };

export function getProvider(key: OAuthProviderKey): OAuthProvider {
  switch (key) {
    case "github":
      return github;
    case "google":
      return google;
  }
}
