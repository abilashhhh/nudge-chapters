"use client";

import { ChevronLeft, ChevronRight, ImagePlus, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { MAX_IMAGES, uploadImage, useImageUrl } from "@/lib/attachments";

/** One stored photo, loaded through its (signed) link. */
export function Thumb({ refId, className, alt = "", onClick }: { refId: string; className?: string; alt?: string; onClick?: () => void }) {
  const url = useImageUrl(refId);
  const body = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} />
  ) : (
    <span className="skeleton-shimmer block h-full w-full" aria-hidden />
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cn("block overflow-hidden bg-surface-3", className)} aria-label={alt || "Open photo"}>
      {body}
    </button>
  ) : (
    <span className={cn("block overflow-hidden bg-surface-3", className)}>{body}</span>
  );
}

/** Full-screen viewer: arrows / swipe to move, Esc or tap outside to close. */
export function Lightbox({ images, index, onClose }: { images: string[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  const url = useImageUrl(images[i]);
  const startX = useRef<number | null>(null);
  const go = useCallback((d: number) => setI((n) => (n + d + images.length) % images.length), [images.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      className="anim-fade fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (startX.current == null) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        startX.current = null;
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      ) : (
        <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
      )}
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
        <X className="h-5 w-5" />
      </button>
      {images.length > 1 && (
        <>
          <button type="button" onClick={(e) => (e.stopPropagation(), go(-1))} aria-label="Previous photo" className="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={(e) => (e.stopPropagation(), go(1))} aria-label="Next photo" className="absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <ChevronRight className="h-5 w-5" />
          </button>
          <span className="num absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-[13px] text-white">
            {i + 1} / {images.length}
          </span>
        </>
      )}
    </div>,
    document.body,
  );
}

/** Upload files and hand back their references (several at once; errors shown, the rest still added). */
export async function uploadMany(files: File[], room: number): Promise<string[]> {
  const list = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, room));
  if (files.length > list.length && room <= list.length) toast.error(`Up to ${MAX_IMAGES} photos each.`);
  const out: string[] = [];
  for (const f of list) {
    try {
      out.push(await uploadImage(f));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Couldn't add ${f.name}`);
    }
  }
  return out;
}

/**
 * Photos on an item: thumbnails (tap to view), × to remove, and an Add tile that opens the camera or gallery.
 * Photos can also be pasted (Ctrl/⌘ V) or dropped onto the strip.
 */
export function ImageAttachments({ images, onChange, label = "Photos", className }: { images: string[]; onChange: (next: string[]) => void; label?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [view, setView] = useState<number | null>(null);
  const latest = useRef(images);
  latest.current = images;
  const add = async (files: File[]) => {
    if (!files.length) return;
    const room = MAX_IMAGES - latest.current.length;
    setBusy(Math.min(files.length, Math.max(room, 0)));
    try {
      const refs = await uploadMany(files, room);
      if (refs.length) onChange([...latest.current, ...refs]);
    } finally {
      setBusy(0);
    }
  };
  return (
    <div
      className={cn("flex flex-col gap-1.5", className)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void add([...e.dataTransfer.files]);
      }}
      onPaste={(e) => {
        const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
        if (files.length) {
          e.preventDefault();
          void add(files);
        }
      }}
    >
      {label && <p className="text-[13px] font-medium text-ink-2">{label} <span className="font-normal text-ink-3">(optional)</span></p>}
      <div className="flex flex-wrap gap-2">
        {images.map((r, k) => (
          <div key={r} className="group relative h-20 w-20 sm:h-24 sm:w-24">
            <Thumb refId={r} onClick={() => setView(k)} className="h-full w-full rounded-xl" alt={`Photo ${k + 1}`} />
            <button
              type="button"
              onClick={() => onChange(images.filter((x) => x !== r))}
              aria-label={`Remove photo ${k + 1}`}
              className="absolute -right-1.5 -top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-panel hover:text-danger"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {Array.from({ length: busy }, (_, k) => (
          <span key={`u${k}`} className="flex h-20 w-20 items-center justify-center rounded-xl bg-surface-3 sm:h-24 sm:w-24" aria-label="Uploading">
            <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
          </span>
        ))}
        {images.length + busy < MAX_IMAGES && (
          <button type="button" onClick={() => input.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong text-[11.5px] font-medium text-ink-3 transition-colors hover:border-brand hover:text-brand sm:h-24 sm:w-24">
            <ImagePlus className="h-5 w-5" aria-hidden />
            Add photo
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void add([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {view != null && <Lightbox images={images} index={view} onClose={() => setView(null)} />}
    </div>
  );
}

/** Read-only row of photos; tap one to view them full screen. */
export function PhotoStrip({ images, size = "h-14 w-14", className }: { images?: string[] | null; size?: string; className?: string }) {
  const [view, setView] = useState<number | null>(null);
  if (!images?.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} onClick={(e) => e.stopPropagation()}>
      {images.map((r, k) => (
        <Thumb key={r} refId={r} onClick={() => setView(k)} className={cn("rounded-lg", size)} alt={`Photo ${k + 1}`} />
      ))}
      {view != null && <Lightbox images={images} index={view} onClose={() => setView(null)} />}
    </div>
  );
}
