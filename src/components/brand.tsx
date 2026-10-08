import { cn } from "@/lib/cn";
import { APP_NAME, TAGLINE } from "@/lib/config";

/** The app icon: a path through past chapters with a dotted nudge towards the next one. Same artwork as public/icon.svg. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden focusable="false">
      <rect width="512" height="512" rx="112" fill="#1f6b4f" />
      <path d="M120 312c40-8 64-52 104-52s56 40 96 40 52-44 72-60" fill="none" stroke="#eef1ec" strokeWidth="30" strokeLinecap="round" />
      <path d="M392 240c18-16 30-30 40-44" fill="none" stroke="#b9acff" strokeWidth="30" strokeLinecap="round" strokeDasharray="2 34" />
      <circle cx="392" cy="240" r="24" fill="#eef1ec" />
    </svg>
  );
}

const SIZES = {
  sm: { mark: "h-6 w-6", text: "text-[18px]", gap: "gap-2" },
  md: { mark: "h-7 w-7", text: "text-[21px]", gap: "gap-2.5" },
  lg: { mark: "h-10 w-10", text: "text-[28px]", gap: "gap-3" },
} as const;

/** Wordmark: icon + "Nudge Chapters", optionally with the tagline underneath. */
export function Brand({
  size = "md",
  tagline = false,
  className,
  taglineClassName,
}: {
  size?: keyof typeof SIZES;
  tagline?: boolean;
  className?: string;
  taglineClassName?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex min-w-0 items-center", s.gap, className)}>
      <BrandMark className={cn("shrink-0", s.mark)} />
      <span className="min-w-0">
        <span className={cn("display block truncate font-bold leading-none tracking-tight", s.text)}>{APP_NAME}</span>
        {tagline && <span className={cn("mt-1.5 block text-[13px] leading-snug text-ink-3", taglineClassName)}>{TAGLINE}</span>}
      </span>
    </span>
  );
}
