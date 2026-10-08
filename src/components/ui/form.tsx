"use client";

import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { amountInWords, currencySymbol, parseAmount } from "@/lib/money";

const control =
  "w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 outline-none transition-colors hover:border-line-strong focus:border-future focus:ring-2 focus:ring-future/20 disabled:opacity-60";

export function Field({
  label,
  help,
  error,
  children,
  htmlFor,
  className,
  optional,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
        {optional && <span className="font-normal text-ink-3"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="text-[12.5px] leading-snug text-ink-3">{help}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-20 py-2.5", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, "h-11 appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
      </svg>
    </div>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  help,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  help?: ReactNode;
  id?: string;
}) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <label htmlFor={sid} className="flex-1 cursor-pointer">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {help && <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{help}</span>}
      </label>
      <button
        id={sid}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-brand" : "bg-line-strong",
        )}
      >
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

/** Amount input: numeric keypad on phones, accepts "1.5L" / "2cr" / "12k", shows the amount in words. */
export function AmountInput({
  value,
  onChange,
  currency = "INR",
  locale = "en-IN",
  id,
  placeholder = "0",
  autoFocus,
  large,
  allowNegative,
  ariaLabel,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  currency?: string;
  locale?: string;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
  large?: boolean;
  allowNegative?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value == null || Number.isNaN(value) ? "" : String(value));
  useEffect(() => {
    const parsed = parseAmount(text);
    if (value == null && text !== "" && parsed == null) return;
    if (parsed !== value) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const words = value ? amountInWords(value, { currency, locale }) : "";
  return (
    <div>
      <div className="relative">
        <span className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3", large ? "text-2xl display" : "text-[15px]")}>
          {currencySymbol({ currency, locale })}
        </span>
        <input
          id={id}
          aria-label={ariaLabel}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          className={cn(control, "num", large ? "display h-16 pl-10 text-[32px] font-semibold" : "h-11 pl-8")}
          value={text}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const v = parseAmount(raw);
            onChange(v == null ? null : allowNegative ? v : Math.abs(v));
          }}
        />
      </div>
      {words && <p className="mt-1 text-[12.5px] text-ink-3">{words}</p>}
    </div>
  );
}

export function DateInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" className={cn(control, "h-11 num", className)} {...rest} />;
}

export function NumberInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" inputMode="decimal" className={cn(control, "h-11 num", className)} {...rest} />;
}
