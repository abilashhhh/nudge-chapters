"use client";

// Photos attached to notes, to-dos, checklists, reminders and wishlist items.
// Signed in: shrunk on the device, then uploaded to a private storage bucket under your own folder; shown through
// short-lived signed links. Without an account: kept as a small data URL inside the item, on this device.
// An item stores references only: "sb:<path>" or "data:…".

import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "./data/supabase";
import { newId } from "./data/repo";

export const BUCKET = "attachments";
export const MAX_IMAGES = 8;
const MAX_BYTES = 5 * 1024 * 1024;

function cloudMode(): boolean {
  try {
    return supabaseConfigured && localStorage.getItem("nudge:mode") !== "local";
  } catch {
    return false;
  }
}

/** Resize to fit `max` px on the long side and re-encode (WebP, or JPEG where WebP isn't supported). */
async function shrink(file: File, max: number, quality: number): Promise<Blob> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Formats the browser can't decode here (e.g. HEIC on some browsers): keep the original if it's small enough.
    if (file.size <= MAX_BYTES) return file;
    throw new Error("This photo is too large and couldn't be shrunk. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  if ("close" in bitmap) bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  const webp = await toBlob("image/webp");
  const blob = webp && webp.type === "image/webp" ? webp : await toBlob("image/jpeg");
  if (!blob) throw new Error("Couldn't read this photo.");
  return blob;
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

/** Upload one photo; returns the reference to keep on the item. */
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't an image.`);
  if (!cloudMode()) return toDataUrl(await shrink(file, 1000, 0.75));
  const blob = await shrink(file, 1600, 0.82);
  if (blob.size > MAX_BYTES) throw new Error("This photo is still over 5 MB after shrinking.");
  const sb = getSupabase();
  const { data: s } = await sb.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) throw new Error("Sign in again to add photos.");
  const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : blob.type.startsWith("image/hei") ? "heic" : "jpg";
  const path = `${uid}/${newId()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || file.type, cacheControl: "3600", upsert: false });
  if (error) throw new Error(/bucket not found/i.test(error.message) ? "Photo storage isn't set up on the server yet." : error.message);
  return `sb:${path}`;
}

/** Remove stored photos (data URLs need nothing). Failures are ignored: an orphaned file harms nothing. */
export async function deleteImages(refs: string[]): Promise<void> {
  const paths = refs.filter((r) => r.startsWith("sb:")).map((r) => r.slice(3));
  if (!paths.length || !cloudMode()) return;
  try {
    await getSupabase().storage.from(BUCKET).remove(paths);
  } catch {
    /* ignore */
  }
}

// Signed links are cached for most of their life, so scrolling a list doesn't re-sign every photo.
const cache = new Map<string, { url: string; until: number }>();
const pending = new Map<string, Promise<string | null>>();
const LINK_SECONDS = 3600;

export async function imageUrl(ref: string): Promise<string | null> {
  if (!ref.startsWith("sb:")) return ref;
  const hit = cache.get(ref);
  if (hit && hit.until > Date.now()) return hit.url;
  if (pending.has(ref)) return pending.get(ref)!;
  const p = (async () => {
    try {
      const { data, error } = await getSupabase().storage.from(BUCKET).createSignedUrl(ref.slice(3), LINK_SECONDS);
      if (error || !data?.signedUrl) return null;
      cache.set(ref, { url: data.signedUrl, until: Date.now() + (LINK_SECONDS - 300) * 1000 });
      return data.signedUrl;
    } catch {
      return null;
    } finally {
      pending.delete(ref);
    }
  })();
  pending.set(ref, p);
  return p;
}

/** The displayable URL for a reference (null while loading or if it's gone). */
export function useImageUrl(ref: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (ref && !ref.startsWith("sb:") ? ref : (ref && cache.get(ref)?.url) || null));
  useEffect(() => {
    let live = true;
    if (!ref) {
      setUrl(null);
      return;
    }
    void imageUrl(ref).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [ref]);
  return url;
}
