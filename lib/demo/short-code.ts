import { randomInt } from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * The code behind a demo ticket's /t/{code} short link (FR-010): 8 random characters
 * from an alphabet without look-alikes (0/O, 1/l/I), ~1.3e14 combinations. It only
 * locates the ticket — opening it still needs a logged-in user with access to it.
 */
export function generateShortCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function shortUrlFor(code: string): string {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/t/${code}`;
}
