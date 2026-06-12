import { sha256Hex } from "./hash.js";

/**
 * Salted SHA-256 of a visitor IP. The per-install salt (persisted in the
 * settings table) means the stored hash isn't a bare digest an attacker
 * could reverse with a rainbow table of the IPv4 space. Cleartext IPs are
 * never stored.
 */
export function hashIp(ip: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${ip}`);
}
