/**
 * AES-256-GCM encryption for OAuth tokens stored in creator_social_accounts.
 *
 * Shared by the Supabase Edge Functions (Deno) and the Node worker, so it must
 * stay dependency-free: only Web Crypto + btoa/atob, which both runtimes
 * provide on globalThis.
 *
 * Key: 32 bytes, base64-encoded (generate with `openssl rand -base64 32`),
 * supplied via the SOCIAL_TOKEN_ENCRYPTION_KEY secret in every runtime that
 * reads or writes tokens.
 *
 * Wire format: enc:v1:<base64url iv>:<base64url ciphertext+tag>
 * Values without the prefix are legacy plaintext rows and pass through
 * decryptToken unchanged, so rows written before this scheme keep working.
 */

const ENCRYPTED_PREFIX = "enc:v1:";

export function isEncryptedToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(keyBase64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(keyBase64.trim());
  if (raw.length !== 32) {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptToken(plaintext: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${ENCRYPTED_PREFIX}${bytesToBase64Url(iv)}:${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypts enc:v1 values; legacy plaintext passes through unchanged. Throws on
 * a missing/wrong key or a corrupted value — callers must treat that as
 * "token unavailable", never as an empty token.
 */
export async function decryptToken(
  value: string,
  keyBase64: string | undefined
): Promise<string> {
  if (!isEncryptedToken(value)) return value;
  if (!keyBase64) {
    throw new Error("Token is encrypted but SOCIAL_TOKEN_ENCRYPTION_KEY is not configured.");
  }
  const [ivPart, dataPart, ...rest] = value.slice(ENCRYPTED_PREFIX.length).split(":");
  if (!ivPart || !dataPart || rest.length > 0) {
    throw new Error("Malformed encrypted token value.");
  }
  const key = await importKey(keyBase64);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivPart) as BufferSource },
    key,
    base64ToBytes(dataPart) as BufferSource
  );
  return new TextDecoder().decode(plaintext);
}
