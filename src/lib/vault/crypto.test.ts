import { describe, expect, it } from "vitest";
import { deriveKey, fromB64, generatePassword, importDataKey, newDataKey, open, randomBytes, seal, strength, toB64, unwrapDataKey, wrapDataKey } from "./crypto";

const FAST = 1000; // fewer rounds keep the tests quick; the app uses KDF_ITERATIONS

describe("vault crypto", () => {
  it("round-trips an entry and never stores it in the clear", async () => {
    const salt = randomBytes(16);
    const key = await deriveKey("correct horse battery staple", salt, FAST);
    const entry = { title: "Bank", username: "me@example.com", password: "s3cr3t!" };
    const s = await seal(key, entry);
    expect(atob(s.ct)).not.toContain("s3cr3t");
    expect(await open(key, s)).toEqual(entry);
  });

  it("uses a fresh IV every time", async () => {
    const key = await deriveKey("pw", randomBytes(16), FAST);
    const a = await seal(key, "x");
    const b = await seal(key, "x");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("rejects the wrong master password and tampered data", async () => {
    const salt = randomBytes(16);
    const right = await deriveKey("right password", salt, FAST);
    const wrong = await deriveKey("wrong password", salt, FAST);
    const raw = newDataKey();
    const wrapped = await wrapDataKey(right, raw);
    expect(await unwrapDataKey(right, wrapped)).toEqual(raw);
    expect(await unwrapDataKey(wrong, wrapped)).toBeNull();
    const dk = await importDataKey(raw);
    const s = await seal(dk, { a: 1 });
    const bytes = fromB64(s.ct);
    bytes[0] ^= 1;
    await expect(open(dk, { iv: s.iv, ct: toB64(bytes) })).rejects.toThrow();
  });

  it("changing the master password keeps every entry readable", async () => {
    const raw = newDataKey();
    const dk = await importDataKey(raw);
    const entry = await seal(dk, { title: "Mail", password: "x" });
    const oldKek = await deriveKey("old master", randomBytes(16), FAST);
    const wrapped = await wrapDataKey(oldKek, raw);
    // Change: unwrap with the old, re-wrap with the new; entries are untouched.
    const newSalt = randomBytes(16);
    const newKek = await deriveKey("new master", newSalt, FAST);
    const rewrapped = await wrapDataKey(newKek, (await unwrapDataKey(oldKek, wrapped))!);
    const again = await importDataKey((await unwrapDataKey(await deriveKey("new master", newSalt, FAST), rewrapped))!);
    expect(await open(again, entry)).toEqual({ title: "Mail", password: "x" });
    expect(await unwrapDataKey(oldKek, rewrapped)).toBeNull();
  });

  it("generates passwords with every chosen character type", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword(16);
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[^a-zA-Z0-9]/);
    }
    expect(generatePassword(12, { symbols: false })).toMatch(/^[a-zA-Z0-9]{12}$/);
    expect(new Set(Array.from({ length: 20 }, () => generatePassword(20))).size).toBe(20);
  });

  it("judges strength sensibly", () => {
    expect(strength("password123").score).toBeLessThanOrEqual(1);
    expect(strength("aaaa1234").score).toBeLessThanOrEqual(1);
    expect(strength(generatePassword(20)).score).toBe(4);
    expect(strength("Tr4in-Gate-Mango-41").score).toBeGreaterThanOrEqual(3);
  });
});
