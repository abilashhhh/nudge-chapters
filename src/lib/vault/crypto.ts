// Password vault cryptography. Everything is encrypted on your device before it's saved:
//   master password + random salt --PBKDF2-SHA256 (600,000 rounds)--> key-encryption key (KEK)
//   a random 256-bit data key, sealed with the KEK (AES-256-GCM) — "the wrapped key"
//   each entry (title, username, password, url, notes…) --AES-256-GCM with the data key, fresh 96-bit IV--> ciphertext
// The server only ever sees salt, IVs and ciphertext. The master password isn't stored anywhere, so it can't be
// recovered — or stolen from the database. Changing it only re-wraps the data key (one small, atomic write).

export const KDF_ITERATIONS = 600_000;
const CHECK_TEXT = "nudge-vault-v1";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** The encryption key, from the master password. Not extractable: script can use it but never read it out. */
export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export interface Sealed {
  iv: string;
  ct: string;
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value))));
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** Throws if the key is wrong or the data was tampered with (GCM checks both). */
export async function open<T>(key: CryptoKey, s: Sealed): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(s.iv) }, key, fromB64(s.ct));
  return JSON.parse(dec.decode(pt)) as T;
}

/** A new random data key (raw bytes, used once to wrap and import). */
export function newDataKey(): Uint8Array<ArrayBuffer> {
  return randomBytes(32);
}

/** Seal the data key with the key from the master password. */
export async function wrapDataKey(kek: CryptoKey, raw: Uint8Array): Promise<Sealed> {
  return seal(kek, { v: CHECK_TEXT, k: toB64(raw) });
}

/** The data key's raw bytes, or null when the master password is wrong (GCM authentication fails). */
export async function unwrapDataKey(kek: CryptoKey, wrapped: Sealed): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const r = await open<{ v: string; k: string }>(kek, wrapped);
    return r.v === CHECK_TEXT ? fromB64(r.k) : null;
  } catch {
    return null;
  }
}

/** The data key as a usable, non-extractable key. */
export async function importDataKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ---------------------------------------------------------------------------
// Passwords: generate and judge
// ---------------------------------------------------------------------------

const SETS = {
  lower: "abcdefghijkmnopqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digits: "23456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?",
};

/** Random from the browser's secure generator, without modulo bias. */
function pick(chars: string): string {
  const limit = 256 - (256 % chars.length);
  for (;;) {
    const [b] = randomBytes(1);
    if (b < limit) return chars[b % chars.length];
  }
}

export function generatePassword(length = 20, opts: { symbols?: boolean; digits?: boolean; upper?: boolean } = {}): string {
  const { symbols = true, digits = true, upper = true } = opts;
  const pools = [SETS.lower, upper && SETS.upper, digits && SETS.digits, symbols && SETS.symbols].filter(Boolean) as string[];
  const all = pools.join("");
  const n = Math.max(length, pools.length);
  // At least one from each chosen set, the rest from all, then shuffled.
  const chars = [...pools.map(pick), ...Array.from({ length: n - pools.length }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const COMMON = ["password", "123456", "qwerty", "111111", "abc123", "iloveyou", "admin", "welcome", "letmein", "monkey", "dragon", "india", "sunshine", "princess", "football"];

export interface Strength {
  /** 0 very weak … 4 very strong */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  bits: number;
  hint?: string;
}

/** A plain estimate: character variety × length, with penalties for common words, repeats and sequences. */
export function strength(pw: string): Strength {
  if (!pw) return { score: 0, label: "Empty", bits: 0 };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  let bits = pw.length * Math.log2(Math.max(pool, 2));
  let hint: string | undefined;
  const lower = pw.toLowerCase();
  if (COMMON.some((c) => lower.includes(c))) {
    bits = Math.min(bits, 20);
    hint = "Contains a very common password";
  }
  if (/(.)\1{2,}/.test(pw)) {
    bits -= 10;
    hint ??= "Avoid repeated characters";
  }
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf)/i.test(pw)) {
    bits -= 10;
    hint ??= "Avoid sequences like 1234 or abcd";
  }
  if (pw.length < 10) hint ??= "Use at least 12 characters";
  bits = Math.max(0, Math.round(bits));
  const score = (bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4) as Strength["score"];
  return { score, bits, label: ["Very weak", "Weak", "Fair", "Strong", "Very strong"][score], hint };
}
