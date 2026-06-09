import { describe, expect, it } from "vitest";
import {
  decryptToken,
  encryptToken,
  isEncryptedToken,
} from "../../supabase/functions/_shared/token-crypto";

// 32 deterministic bytes, base64 — matches `openssl rand -base64 32` output shape.
const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

describe("token-crypto", () => {
  it("round-trips a token through encrypt/decrypt", async () => {
    const encrypted = await encryptToken("ya29.secret-token", KEY);
    expect(isEncryptedToken(encrypted)).toBe(true);
    expect(encrypted).not.toContain("secret-token");
    await expect(decryptToken(encrypted, KEY)).resolves.toBe("ya29.secret-token");
  });

  it("produces a fresh IV per encryption (no deterministic ciphertext)", async () => {
    const first = await encryptToken("same-value", KEY);
    const second = await encryptToken("same-value", KEY);
    expect(first).not.toBe(second);
  });

  it("passes legacy plaintext rows through unchanged", async () => {
    expect(isEncryptedToken("legacy-plaintext-token")).toBe(false);
    await expect(decryptToken("legacy-plaintext-token", KEY)).resolves.toBe(
      "legacy-plaintext-token"
    );
    await expect(decryptToken("legacy-plaintext-token", undefined)).resolves.toBe(
      "legacy-plaintext-token"
    );
  });

  it("rejects decryption with the wrong key", async () => {
    const encrypted = await encryptToken("ya29.secret-token", KEY);
    await expect(decryptToken(encrypted, OTHER_KEY)).rejects.toThrow();
  });

  it("rejects encrypted values when no key is configured", async () => {
    const encrypted = await encryptToken("ya29.secret-token", KEY);
    await expect(decryptToken(encrypted, undefined)).rejects.toThrow(
      /SOCIAL_TOKEN_ENCRYPTION_KEY/
    );
  });

  it("rejects keys that are not exactly 32 bytes", async () => {
    await expect(encryptToken("x", Buffer.alloc(16, 1).toString("base64"))).rejects.toThrow(
      /32 bytes/
    );
  });

  it("rejects malformed encrypted values", async () => {
    await expect(decryptToken("enc:v1:only-one-part", KEY)).rejects.toThrow(/Malformed/);
  });
});
