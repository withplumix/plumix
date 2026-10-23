// Real ES256 WebAuthn responses with known-good results, copied from
// SimpleWebAuthn's server test suite (MIT, © 2020 Matthew Miller):
// https://github.com/MasterKale/SimpleWebAuthn/tree/master/packages/server/src

/** The relying party every vector was captured against. */
export const VECTOR_RP = {
  rpName: "SimpleWebAuthn",
  rpId: "dev.dontneeda.pw",
  origin: "https://dev.dontneeda.pw",
} as const;

/** `attestationNone` in `verifyRegistrationResponse.test.ts`. */
export const NONE_ATTESTATION = {
  challenge: "aEVjY1BXdXppUDAwSDBwNWd4aDJfdTVfUEM0TmVZZ2Q",
  response: {
    id: "AdKXJEch1aV5Wo7bj7qLHskVY4OoNaj9qu8TPdJ7kSAgUeRxWNngXlcNIGt4gexZGKVGcqZpqqWordXb_he1izY",
    rawId:
      "AdKXJEch1aV5Wo7bj7qLHskVY4OoNaj9qu8TPdJ7kSAgUeRxWNngXlcNIGt4gexZGKVGcqZpqqWordXb_he1izY",
    type: "public-key",
    response: {
      attestationObject:
        "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVjFPdxHEOnAiLIp26idVjIguzn3I" +
        "pr_RlsKZWsa-5qK-KBFAAAAAAAAAAAAAAAAAAAAAAAAAAAAQQHSlyRHIdWleVqO24-6ix7JFWODqDWo_arvEz3Se" +
        "5EgIFHkcVjZ4F5XDSBreIHsWRilRnKmaaqlqK3V2_4XtYs2pQECAyYgASFYID5PQTZQQg6haZFQWFzqfAOyQ_ENs" +
        "MH8xxQ4GRiNPsqrIlggU8IVUOV8qpgk_Jh-OTaLuZL52KdX1fTht07X4DiQPow",
      clientDataJSON:
        "eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiYUVWalkxQlhkWHBw" +
        "VURBd1NEQndOV2Q0YURKZmRUVmZVRU0wVG1WWloyUSIsIm9yaWdpbiI6Imh0dHBzOlwvXC9kZXYuZG9udG5lZWRh" +
        "LnB3IiwiYW5kcm9pZFBhY2thZ2VOYW1lIjoib3JnLm1vemlsbGEuZmlyZWZveCJ9",
      transports: [],
    },
  },
  /** The suite's expected COSE key, re-encoded SEC1 uncompressed. */
  publicKeySec1Hex:
    "043e4f413650420ea1699150585cea7c03b243f10db0c1fcc7143819188d3ecaab" +
    "53c21550e57caa9824fc987e39368bb992f9d8a757d5f4e1b74ed7e038903e8c",
} as const;

/** "should verify None attestation w/RSA public key": an RS256 credential. */
export const NONE_ATTESTATION_RS256 = {
  challenge: "pYZ3VX2yb8dS9yplNxJChiXhPGBk8gZzTAyJ2iU5x1k",
  response: {
    id: "kGXv4RJWLeXRw8Yf3T22K3Gq_GGeDv9OKYmAHLm0Ylo",
    rawId: "kGXv4RJWLeXRw8Yf3T22K3Gq_GGeDv9OKYmAHLm0Ylo",
    type: "public-key",
    response: {
      attestationObject:
        "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVkBZz3cRxDpwIiyKduonVYyILs59yKa_0ZbCmVrGvuaivigRQAAAABgKLAXsdRMArSzr82vyWuyACCQZe_hElYt5dHDxh_dPbYrcar8YZ4O_04piYAcubRiWqQBAwM5AQAgWQEA8X6V649G2vwB99CSf_luwR0jj7oDg_GhA3TQSnNYIwfQJldxT5dmi9H8IjjCrTP28iNuKl29hc3Mowux1FZB0bc5AEJ2oV3JCOMGP9NZKGmOosF7iBN2GtGY7Nomcs-ruBv2mxp1nTm6mv5B8XNwh0e18uTA5AJCsl-k6lNLYB2XBIQ3fy2-TjSQ8IOMLypWQbWWBJXzLmepaJ6EWe6kf_NaxpA2chWsaekZcr8xG6OIo3iGh0Mpags_qBZtN4n2TDn0R2LheLk4yQ0R_oOAVtX963Yuw0x5NYSZyMNSMi_1RSEPTYn5AILmIzQskglDaWJYtnjKz4QLuXWCRRYyDSFDAQAB",
      clientDataJSON:
        "eyJjaGFsbGVuZ2UiOiJwWVozVlgyeWI4ZFM5eXBsTnhKQ2hpWGhQR0JrOGdaelRBeUoyaVU1eDFrIiwiY2xpZW50RXh0ZW5zaW9ucyI6e30sImhhc2hBbGdvcml0aG0iOiJTSEEtMjU2Iiwib3JpZ2luIjoiaHR0cHM6Ly9kZXYuZG9udG5lZWRhLnB3IiwidHlwZSI6IndlYmF1dGhuLmNyZWF0ZSJ9",
      transports: [],
    },
  },
} as const;

/**
 * `assertionResponse` in `verifyAuthenticationResponse.test.ts`. Its DER
 * signature's `r` has the high bit set, so it carries a leading 0x00.
 */
export const ASSERTION = {
  challenge: "dG90YWxseVVuaXF1ZVZhbHVlRXZlcnlUaW1l",
  response: {
    id: "KEbWNCc7NgaYnUyrNeFGX9_3Y-8oJ3KwzjnaiD1d1LVTxR7v3CaKfCz2Vy_g_MHSh7yJ8yL0Pxg6jo_o0hYiew",
    rawId:
      "KEbWNCc7NgaYnUyrNeFGX9_3Y-8oJ3KwzjnaiD1d1LVTxR7v3CaKfCz2Vy_g_MHSh7yJ8yL0Pxg6jo_o0hYiew",
    type: "public-key",
    response: {
      authenticatorData: "PdxHEOnAiLIp26idVjIguzn3Ipr_RlsKZWsa-5qK-KABAAAAkA==",
      clientDataJSON:
        "eyJjaGFsbGVuZ2UiOiJkRzkwWVd4c2VWVnVhWEYxWlZaaGJIVmxSWFpsY25sVWFXMWwiLCJj" +
        "bGllbnRFeHRlbnNpb25zIjp7fSwiaGFzaEFsZ29yaXRobSI6IlNIQS0yNTYiLCJvcmlnaW4iOiJodHRwczovL2Rldi5k" +
        "b250bmVlZGEucHciLCJ0eXBlIjoid2ViYXV0aG4uZ2V0In0=",
      signature:
        "MEUCIQDYXBOpCWSWq2Ll4558GJKD2RoWg958lvJSB_GdeokxogIgWuEVQ7ee6AswQY0OsuQ6y8Ks6" +
        "jhd45bDx92wjXKs900=",
    },
  },
  /** The suite's `credential.publicKey` COSE key, re-encoded SEC1 uncompressed. */
  publicKeySec1Hex:
    "04885e169faee86bc54f62cd1a8bdfdd9ad3d2215506c03fefaad1cacc511bd035" +
    "f1619e03a84f9a769bd07015894615464c1335c37bed005ffd147476fde522f4",
  storedCounter: 143,
  newCounter: 144,
} as const;

/** `assertionFirstTimeUsedResponse`: an authenticator that keeps no counter. */
export const ASSERTION_FIRST_USE = {
  challenge: "dG90YWxseVVuaXF1ZVZhbHVlRXZlcnlBc3NlcnRpb24",
  response: {
    id: "wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A",
    rawId:
      "wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A",
    type: "public-key",
    response: {
      authenticatorData: "PdxHEOnAiLIp26idVjIguzn3Ipr_RlsKZWsa-5qK-KABAAAAAA",
      clientDataJSON:
        "eyJjaGFsbGVuZ2UiOiJkRzkwWVd4c2VWVnVhWEYxWlZaaGJIVmxSWFpsY25sQmMzTmxjblJwYjI0IiwiY2xpZW50RXh0ZW5zaW9ucyI6e30sImhhc2hBbGdvcml0aG0iOiJTSEEtMjU2Iiwib3JpZ2luIjoiaHR0cHM6Ly9kZXYuZG9udG5lZWRhLnB3IiwidHlwZSI6IndlYmF1dGhuLmdldCJ9",
      signature:
        "MEQCIBu6M-DGzu1O8iocGHEj0UaAZm0HmxTeRIE6-nS3_CPjAiBDsmIzy5sacYwwzgpXqfwRt_2vl5yiQZ_OAqWJQBGVsQ",
    },
  },
  /** The suite's `authenticatorFirstTimeUsed.publicKey`, re-encoded SEC1. */
  publicKeySec1Hex:
    "04699ac51e2605bba4736421b56da5761000779e79afe96394640df0c6dc4e73cf" +
    "f42c94944fb4001d9f6f365b36006f26e45aeebea8da33e984e9adc8d3d1fe46",
  storedCounter: 0,
  newCounter: 0,
} as const;
