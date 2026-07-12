// Chiffrement applicatif des secrets (refresh tokens OAuth) : AES-256-GCM.
// La clé ENCRYPTION_KEY (32 octets, base64) ne quitte jamais le serveur.
// Hachage du PIN parlé : scrypt (résistant au brute-force).

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

function key(): Buffer {
  const k = Buffer.from(env("ENCRYPTION_KEY"), "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY doit faire 32 octets en base64");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), enc.toString("base64"), cipher.getAuthTag().toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, encB64, tagB64] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]).toString("utf8");
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin.normalize("NFKC"), salt, 32);
  return `${salt.toString("base64")}.${hash.toString("base64")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split(".");
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(pin.normalize("NFKC"), Buffer.from(saltB64, "base64"), 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Comparaison en temps constant de deux chaînes (secrets d'en-tête).
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
