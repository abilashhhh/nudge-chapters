"use client";

// App lock (requirement §9). The PIN never leaves the device and is never stored: only a salted
// PBKDF2-SHA-256 hash is kept in this browser's storage. Biometrics use the device's own authenticator
// (Face ID / Touch ID / fingerprint / Windows Hello) through WebAuthn — the app never sees biometric data,
// only that the device verified you.

export interface LockConfig {
  enabled: boolean;
  salt: string;
  hash: string;
  /** WebAuthn credential id (base64url) when biometric unlock is on. */
  credId?: string | null;
  /** Minutes of inactivity before locking; 0 = lock as soon as you leave the app. */
  autoLockMin: number;
}

const KEY = "nudge:lock";
const ITER = 150_000;

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function readLock(): LockConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as LockConfig;
    return c && c.enabled && c.hash && c.salt ? c : null;
  } catch {
    return null;
  }
}

export function writeLock(c: LockConfig | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the lock simply stays off */
  }
  window.dispatchEvent(new Event("nudge:lock-changed"));
}

async function derive(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb64(salt), iterations: ITER, hash: "SHA-256" }, key, 256);
  return b64(bits);
}

export async function makeLock(pin: string, prev?: LockConfig | null): Promise<LockConfig> {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return { enabled: true, salt, hash: await derive(pin, salt), credId: prev?.credId ?? null, autoLockMin: prev?.autoLockMin ?? 5 };
}

export async function checkPin(pin: string, c: LockConfig): Promise<boolean> {
  const h = await derive(pin, c.salt);
  // Constant-time-ish comparison.
  if (h.length !== c.hash.length) return false;
  let d = 0;
  for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ c.hash.charCodeAt(i);
  return d === 0;
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export async function registerBiometric(label: string): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Nudge Chapters" },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: label || "me", displayName: label || "me" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biometric setup was cancelled");
  return b64(cred.rawId);
}

export async function verifyBiometric(credId: string): Promise<boolean> {
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: unb64(credId) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!res;
  } catch {
    return false;
  }
}

const ACTIVE = "nudge:lock-active";

/** Remember when the app was last used, so reopening it within the auto-lock window doesn't ask again. */
export function markActive() {
  try {
    localStorage.setItem(ACTIVE, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function recentlyActive(c: LockConfig): boolean {
  if (c.autoLockMin <= 0) return false;
  try {
    const t = Number(localStorage.getItem(ACTIVE) || 0);
    return Date.now() - t < c.autoLockMin * 60_000;
  } catch {
    return false;
  }
}
