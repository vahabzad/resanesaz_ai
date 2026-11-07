import { createCipheriv, createDecipheriv } from "node:crypto";

const ZERO_IV = Buffer.alloc(16);

export const encryptShadApiPayload = (value: unknown, auth: string): string => {
  const cipher = createCipheriv(
    "aes-256-cbc",
    createSecretPassphrase(auth),
    ZERO_IV,
  );
  const plaintext = JSON.stringify(value);
  return cipher.update(plaintext, "utf8", "base64") + cipher.final("base64");
};

export const decryptShadApiPayload = (
  encryptedBase64: string,
  auth: string,
): unknown => {
  const decipher = createDecipheriv(
    "aes-256-cbc",
    createSecretPassphrase(auth),
    ZERO_IV,
  );
  const plaintext =
    decipher.update(encryptedBase64, "base64", "utf8") + decipher.final("utf8");
  return JSON.parse(plaintext);
};

// API v6 applies this involutive character transform before sending auth.
// Applying it a second time restores the auth used by the AES response cipher.
export const transformShadV6Auth = (auth: string): string =>
  [...auth]
    .map((character) => {
      if (/\d/.test(character)) {
        return String.fromCharCode(
          ((13 - (character.charCodeAt(0) - 48)) % 10) + 48,
        );
      }
      if (/[A-Z]/.test(character)) {
        return String.fromCharCode(
          ((29 - (character.charCodeAt(0) - 65)) % 26) + 65,
        );
      }
      if (/[a-z]/.test(character)) {
        return String.fromCharCode(
          ((32 - (character.charCodeAt(0) - 97)) % 26) + 97,
        );
      }
      return character;
    })
    .join("");

const createSecretPassphrase = (auth: string): Buffer => {
  if (auth.length < 32) {
    throw new Error("Shad auth must contain at least 32 characters");
  }

  const reordered =
    auth.slice(16, 24) +
    auth.slice(0, 8) +
    auth.slice(24, 32) +
    auth.slice(8, 16);
  const transformed = [...reordered]
    .map((character) => {
      if (/\d/.test(character)) {
        return String.fromCharCode(
          ((character.charCodeAt(0) - 48 + 5) % 10) + 48,
        );
      }
      if (/[a-z]/.test(character)) {
        return String.fromCharCode(
          ((character.charCodeAt(0) - 97 + 9) % 26) + 97,
        );
      }
      return character;
    })
    .join("");

  return Buffer.from(transformed, "utf8");
};
