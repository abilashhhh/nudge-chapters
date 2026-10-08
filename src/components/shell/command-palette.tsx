"use client";

import { ArrowRight, CornerDownLeft, Search, Sparkles } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { parseDate } from "@/lib/data/io";
import { addMonths, addYears, endOfMonth, formatDate } from "@/lib/dates";
import { INVESTMENT_TYPE_LABEL, TX_TYPE_LABEL } from "@/lib/engine/defaults";
import { useFinance } from "@/lib/finance";
import { formatMoney, parseAmount } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { NAV } from "./app-shell";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Pull a future date out of phrases like "31 dec 2027", "march 2028", "in 5 years", "end of year". */
export function extractDate(q: string, today: string): string | null {
  const s = q.toLowerCase();
  const direct = s.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+[a-z]{3,9},?\s+\d{4})/);
  if (direct) return parseDate(direct[1].replace(",", ""));
  const my = s.match(/\b([a-z]{3,9})\s+(\d{4})\b/);
  if (my && MONTHS[my[1].slice(0, 3)] != null) return endOfMonth(`${my[2]}-${String(MONTHS[my[1].slice(0, 3)] + 1).padStart(2, "0")}-01`);
  const rel = s.match(/in\s+(\d+)\s+(year|yr|month|mo)/);
  if (rel) return rel[2].startsWith("y") ? addYears(today, Number(rel[1])) : addMonths(today, Number(rel[1]));
  if (/end of (the )?year|31 dec\b|december 31/.test(s)) return `${today.slice(0, 4)}-12-31`;
  if (/next year/.test(s)) return `${Number(today.slice(0, 4)) + 1}-12-31`;
  const yr = s.match(/\bby\s+(20\d{2})\b|\bin\s+(20\d{2})\b/);
  if (yr) return `${yr[1] ?? yr[2]}-12-31`;
  return null;
}

export function CommandPalette() {
  const open = useUI((s) => s.palette);
  const setOpen = useUI((s) => s.setPalette);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const f = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  // Time of the last selection: a double click / repeated Enter within 400 ms runs only once.
  // (A time window can't get stuck the way an on/off flag can.)
  const lastSelect = useRef(0);

  // Fresh state every time the palette opens or closes: empty query, first result highlighted.
  useEffect(() => {
    setQ("");
    setIdx(0);
    lastSelect.current = 0;
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // The input also has autoFocus, so keys typed straight after Ctrl+K aren't lost; this is a fallback.
    const t = setTimeout(() => input.current?.focus(), 20);
    // Escape closes only the palette, even when a sheet is open underneath it (capture phase runs first).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    // Browser back while searching just closes the search.
    const onPop = () => setOpen(false);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("popstate", onPop);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("popstate", onPop);
      // Don't push focus back onto the search button: that left a highlight ring around the icon.
      void prev;
    };
  }, [open, setOpen]);

  // Any navigation (link, back/forward) closes the palette — only when the page really changed.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setOpen(false);
  }, [pathname, setOpen]);

  /** Close the palette (and anything under it), reset it, then run the result once the overlay is gone. */
  const select = (it: Item | undefined) => {
    const now = Date.now();
    if (!it || now - lastSelect.current < 400) return;
    lastSelect.current = now;
    useUI.getState().closeAll();
    setQ("");
    setIdx(0);
    setTimeout(it.run, 0);
  };

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const ui = useUI.getState();
    const go = (href: string) => () => router.push(href);
    const m = (n: number) => formatMoney(n, f.ctx);
    const query = q.trim().toLowerCase();
    const out: Item[] = [];

    const date = query ? extractDate(query, f.today) : null;
    if (date && date > f.today) {
      out.push({ id: "proj", group: "Ask", label: `Project my finances to ${formatDate(date)}`, hint: "Future", run: go(`/projection?date=${date}`) });
    }
    const afford = query.match(/(?:afford|buy|purchase|spend)\D*([\d.,]+\s*(?:k|l|lakh|lakhs|cr|crore)?)/);
    if (afford) {
      const amt = parseAmount(afford[1]);
      if (amt) out.push({ id: "afford", group: "Ask", label: `Can I afford ${m(amt)}?`, hint: "Affordability check", run: go(`/projection?tab=afford&amount=${amt}${date ? `&date=${date}` : ""}`) });
    }
    if (/safe|spend this month|spendable/.test(query)) out.push({ id: "safe", group: "Ask", label: `Safe to spend this month: ${m(f.month.spendable)}`, run: go("/") });
    if (/bills?|due|upcoming/.test(query)) out.push({ id: "bills", group: "Ask", label: "Bills due in the next 30 days", run: go("/cash-flow?tab=bills") });
    if (/net ?worth/.test(query)) out.push({ id: "nw", group: "Ask", label: `Net worth: ${m(f.positions.totals.netWorth)}`, run: go("/reports?tab=networth") });
    if (/owe me|lent|receivable/.test(query)) out.push({ id: "owed", group: "Ask", label: `People owe you ${m(f.positions.totals.receivables)}`, run: go("/assets?tab=lending") });
    if (/how much do i owe|debt|liabilit/.test(query)) out.push({ id: "debt", group: "Ask", label: `You owe ${m(f.positions.totals.totalLiabilities)}`, run: go("/liabilities") });
    // Personal command centre: route plain-language requests to the right screen or form.
    const spendQ = query.match(/spen[dt]\s+(?:on\s+)?([a-z& ]+?)(?:\s+(last|this)\s+month)?\??$/);
    if (spendQ) {
      const word = spendQ[1].trim();
      const last = spendQ[2] === "last";
      const ref = last ? addMonths(f.today, -1) : f.today;
      const from = ref.slice(0, 8) + "01";
      const to = last ? endOfMonth(ref) : f.today;
      const cats = new Set(f.ds.transactions.map((t) => t.category).filter((c): c is string => !!c && c.toLowerCase().includes(word.split(" ")[0])));
      if (cats.size) {
        const total = f.ds.transactions.filter((t) => t.category && cats.has(t.category) && t.date >= from && t.date <= to && (t.type === "expense" || t.type === "card_spend")).reduce((s, t) => s + t.amount, 0);
        out.push({ id: "spent", group: "Ask", label: `${[...cats].join(", ")}: ${m(total)} ${last ? "last month" : "this month so far"}`, hint: "From your transactions", run: go("/reports?tab=spending") });
      }
    }
    if (/upcoming payments|payments due|what.*due|my bills/.test(query)) out.push({ id: "pay", group: "Ask", label: "Show upcoming payments", run: go("/calendar?view=agenda") });
    if (/focus|what should i do|next step|what now/.test(query)) {
      const top = f.nudges[0];
      out.push({ id: "focus", group: "Ask", label: top ? `Focus: ${top.title}` : "Nothing urgent — see Today", run: go("/") });
    }
    const goalQ = query.match(/^(?:create|start|new)\s+(?:an?\s+)?(.+?)\s+(?:goal|chapter)$/);
    if (goalQ) out.push({ id: "mkgoal", group: "Ask", label: `Start a chapter: “${goalQ[1]}”`, run: () => ui.openEditor("goal", undefined, { name: goalQ[1].replace(/^\w/, (c) => c.toUpperCase()) }) });
    const wishQ = query.match(/^add\s+(.+?)\s+to\s+(?:my\s+)?wishlist$/);
    if (wishQ) out.push({ id: "mkwish", group: "Ask", label: `Add “${wishQ[1]}” to wishlist`, run: () => ui.openLife("wishlist", undefined, { title: wishQ[1] }) });
    const remQ = query.match(/^remind me\s+(?:to\s+)?(.+)$/);
    if (remQ) out.push({ id: "mkrem", group: "Ask", label: `Set a reminder: “${remQ[1]}”`, run: () => ui.openLife("reminder", undefined, { title: remQ[1] }) });
    const taskQ = query.match(/^(?:add\s+)?(?:a\s+)?task:?\s+(.+)$/);
    if (taskQ) out.push({ id: "mktask", group: "Ask", label: `Add task: “${taskQ[1]}”`, run: () => ui.openLife("task", undefined, { title: taskQ[1] }) });
    if (/subscri/.test(query)) out.push({ id: "subs", group: "Ask", label: `Subscriptions: ${m(f.norms.subscriptions)}/month`, run: go("/cash-flow?tab=subscriptions") });
    if (/salary.*(increase|hike|raise)|what if/.test(query)) out.push({ id: "whatif", group: "Ask", label: "Open the what-if simulator", run: go("/projection?tab=whatif") });

    const actions: Item[] = [
      { id: "a-exp", group: "Actions", label: "Add expense", hint: "N", run: () => ui.openTx({ type: "expense" }) },
      { id: "a-task", group: "Actions", label: "Add task", run: () => ui.openLife("task") },
      { id: "a-inc", group: "Actions", label: "Add income", run: () => ui.openTx({ type: "income", category: "Salary" }) },
      { id: "a-note", group: "Actions", label: "Write a note", run: () => ui.openLife("note") },
      { id: "a-chap", group: "Actions", label: "Start a chapter", run: () => ui.openEditor("goal") },
      { id: "a-wish", group: "Actions", label: "Add to wishlist", run: () => ui.openLife("wishlist") },
      { id: "a-list", group: "Actions", label: "New checklist", run: () => ui.openLife("checklist") },
      { id: "a-rem", group: "Actions", label: "Set a reminder", run: () => ui.openLife("reminder") },
      { id: "a-tr", group: "Actions", label: "Transfer between accounts", run: () => ui.openTx({ type: "transfer" }) },
      { id: "a-card", group: "Actions", label: "Pay a credit card bill", run: () => ui.openTx({ type: "card_payment" }) },
      { id: "a-rule", group: "Actions", label: "Add recurring income, bill or budget", run: () => ui.openEditor("rule") },
      { id: "a-acct", group: "Actions", label: "Add bank account", run: () => ui.openEditor("account") },
      { id: "a-cc", group: "Actions", label: "Add credit card", run: () => ui.openEditor("card") },
      { id: "a-loan", group: "Actions", label: "Add loan or EMI", run: () => ui.openEditor("loan") },
      { id: "a-inv", group: "Actions", label: "Add investment", run: () => ui.openEditor("investment") },
      { id: "a-lend", group: "Actions", label: "Lend or borrow money", run: () => ui.openEditor("lending") },
      { id: "a-goal", group: "Actions", label: "Create a goal", run: () => ui.openEditor("goal") },
      { id: "a-chit", group: "Actions", label: "Add a chit", run: () => ui.openEditor("chit") },
      { id: "a-mask", group: "Actions", label: f.ds.profile.preferences?.maskValues ? "Show amounts" : "Hide amounts", run: () => updatePrefs({ maskValues: !f.ds.profile.preferences?.maskValues }) },
      { id: "a-export", group: "Actions", label: "Export or back up my data", run: go("/settings?tab=data") },
    ];
    const pages: Item[] = [
      ...NAV.map((n) => ({ id: `p-${n.href}`, group: "Go to", label: n.label, run: go(n.href) })),
      { id: "p-support", group: "Go to", label: "Buy me a coffee", run: go("/support") },
    ];

    if (!query) return [...actions.slice(0, 6), ...pages];

    const match = (s: string | null | undefined) => !!s && s.toLowerCase().includes(query);
    out.push(...actions.filter((a) => match(a.label)), ...pages.filter((p) => match(p.label)));

    for (const a of f.ds.accounts) if (match(a.name) || match(a.institution)) out.push({ id: `acc-${a.id}`, group: "Accounts", label: a.name, hint: m(f.positions.accounts.get(a.id)?.balance ?? 0), run: () => ui.openEditor("account", a.id) });
    for (const c of f.ds.credit_cards) if (match(c.name) || match(c.issuer)) out.push({ id: `cc-${c.id}`, group: "Cards", label: c.name, hint: `${m(f.positions.cards.get(c.id)?.outstanding ?? 0)} owed`, run: go("/liabilities?tab=cards") });
    for (const l of f.ds.loans) if (match(l.name) || match(l.lender)) out.push({ id: `loan-${l.id}`, group: "Loans", label: l.name, hint: `${m(f.positions.loans.get(l.id)?.state.outstanding ?? 0)} left`, run: go(`/liabilities?tab=loans&loan=${l.id}`) });
    for (const i of f.ds.investments) if (match(i.name) || match(i.identifier) || match(INVESTMENT_TYPE_LABEL[i.type])) out.push({ id: `inv-${i.id}`, group: "Investments", label: i.name, hint: m(f.positions.investments.get(i.id)?.value ?? 0), run: () => ui.openEditor("investment", i.id) });
    for (const g of f.ds.goals) if (match(g.name)) out.push({ id: `goal-${g.id}`, group: "Chapters", label: g.name, hint: m(g.target_amount), run: go("/goals") });
    const KIND_GROUP = { task: "Tasks", checklist: "Checklists", note: "Notes", reminder: "Reminders", wishlist: "Wishlist" } as const;
    for (const li of f.ds.life_items) {
      const chapter = li.goal_id ? f.ds.goals.find((g) => g.id === li.goal_id)?.name : undefined;
      if (match(li.title) || match(li.body) || li.tags.some((t) => match(t)) || (li.data?.items ?? []).some((e) => match(e.text)) || match(chapter))
        out.push({ id: `li-${li.id}`, group: KIND_GROUP[li.kind], label: li.title, hint: li.status !== "open" ? "done" : li.due_date ? formatDate(li.due_date, "short") : chapter, run: () => ui.openLife(li.kind, li.id) });
    }
    for (const r of f.ds.recurring_rules) if (match(r.name) || match(r.category)) out.push({ id: `rule-${r.id}`, group: "Recurring", label: r.name, hint: m(r.amount), run: () => ui.openEditor("rule", r.id) });
    for (const l of f.ds.lendings) if (match(l.person)) out.push({ id: `lend-${l.id}`, group: "Lending", label: l.person, hint: m(f.positions.lendings.get(l.id)?.outstanding ?? 0), run: () => ui.openEditor("lending", l.id) });
    for (const c of f.ds.chits) if (match(c.name)) out.push({ id: `chit-${c.id}`, group: "Chits", label: c.name, run: go("/liabilities?tab=chits") });
    const amt = parseAmount(query);
    let n = 0;
    for (const t of f.ds.transactions) {
      if (n >= 25) break;
      if (match(t.description) || match(t.category) || match(t.notes) || (amt != null && Math.abs(t.amount - amt) < 0.5)) {
        n++;
        out.push({
          id: `tx-${t.id}`,
          group: "Transactions",
          label: t.description || t.category || TX_TYPE_LABEL[t.type],
          hint: `${formatDate(t.date, "short")} · ${m(t.amount)}`,
          run: () => ui.openTx(null, t),
        });
      }
    }
    return out;
  }, [open, q, f, router, updatePrefs]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (!open || typeof document === "undefined") return null;
  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-3 pt-[8vh] sm:p-6 sm:pt-[12vh]" role="presentation">
      <div className="animate-fade absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Search" className="animate-sheet relative flex max-h-[75dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-panel">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-5 w-5 text-ink-3" aria-hidden />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                select(items[idx]);
              }
            }}
            placeholder='Search, or ask "how much will I have by Dec 2027?"'
            className="no-focus-ring h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            aria-label="Search records and actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
        </div>
        <div ref={list} id="palette-list" role="listbox" className="overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-[14px] text-ink-3" role="status">
              Nothing matches &ldquo;{q.trim()}&rdquo;. Try a name, an amount or a date.
            </p>
          )}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && <p className="px-3 pb-1 pt-3 text-[12px] font-semibold text-ink-3">{header}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === idx}
                  data-idx={i}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => select(it)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px]", i === idx ? "bg-surface-3" : "")}
                >
                  {it.group === "Ask" ? <Sparkles className="h-4 w-4 shrink-0 text-future" aria-hidden /> : <ArrowRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="num shrink-0 text-[12.5px] text-ink-3">{it.hint}</span>}
                  {i === idx && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
