import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacHex(key: string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Signs a value with AUTH_SECRET, e.g. for unsubscribe links. */
export function sign(value: string): string {
  return hmacHex(secret(), value).slice(0, 32);
}

export function verifySignature(value: string, signature: string): boolean {
  return safeEqual(sign(value), signature);
}

function key(): Buffer {
  return createHash("sha256").update(`enc:${secret()}`).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
