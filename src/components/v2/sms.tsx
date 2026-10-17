"use client";

import { Check, Copy, KeyRound, MessageSquareText, RefreshCw, Smartphone, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { cashDeltas } from "@/lib/engine/ledger";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { INGEST_API_KEY, INGEST_URL, smsAvailable, useSms } from "@/lib/sms/inbox";
import { appBalance, pairSms, proposeFromSms, type SmsProposal, type SmsRow } from "@/lib/sms/match";
import { parseSms } from "@/lib/sms/parse";
import { useStore } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { Money } from "../money";
import { Button } from "../ui/button";
import { Switch } from "../ui/form";
import { Sheet } from "../ui/sheet";
import { V2PageHeader } from "./ui";

const TYPE_WORD: Record<string, string> = {
  card_spend: "Card spend",
  card_payment: "Card bill paid",
  expense: "Spent",
  income: "Received",
  loan_emi: "EMI paid",
  chit_installment: "Chit paid",
  invest_buy: "SIP paid",
  transfer: "Self transfer",
  lend_repayment: "Paid back to you",
  borrow_repayment: "You paid back",
};

type Item = { row: SmsRow; p: SmsProposal };

/** Proposals for every message still waiting in the inbox. */
export function useSmsItems(): Item[] {
  const { ds, positions, events, today } = useFinance();
  const rows = useSms((s) => s.rows);
  const list = useMemo(
    () =>
      rows
        .filter((r) => r.status === "new")
        .map((row) => ({ row, p: proposeFromSms(row, parseSms(row.body, row.sender, today), ds, positions, events, today) }))
        // Oldest first, so pairs (bank + card, or both halves of a transfer) are read in the order they came.
        .reverse(),
    [rows, ds, positions, events, today],
  );
  return useMemo(() => pairSms(list, ds).reverse(), [list, ds]);
}

/** Adds the proposed transaction (and, when asked, matches the account balance to what the SMS says). */
async function addItem({ row, p }: Item, matchBalance: boolean, latestForAccount: boolean) {
  const { add } = useStore.getState();
  if (!p.tx) return;
  const before = p.balance && snapshot ? appBalance(snapshot.positions, p.balance.accountId) : null;
  const tx = await add("transactions", { ...p.tx, tags: [...(p.tx.tags ?? []), `sms:${row.id}`] } as Partial<Transaction>);
  await useSms.getState().mark(row.id, "added", tx.id);
  const more: Transaction[] = [];
  for (const extra of p.also ?? []) more.push(await add("transactions", { ...extra, tags: [...(extra.tags ?? []), `sms:${row.id}`] } as Partial<Transaction>));
  if (matchBalance && latestForAccount && p.balance && before != null) {
    const after = before + [tx, ...more].flatMap((t) => cashDeltas(t as Transaction)).reduce((s, [id, d]) => s + (id === p.balance!.accountId ? d : 0), 0);
    const diff = Math.round((p.balance.bank - after) * 100) / 100;
    if (Math.abs(diff) >= 1) {
      await add("transactions", { date: tx.date, type: "adjustment", amount: diff, account_id: p.balance.accountId, description: "Balance matched with bank SMS", is_partial: false, reconciled: true, tags: ["reconcile", "sms"] });
    }
  }
}

// The latest figures, for adding outside a render (kept up to date by SmsSync).
let snapshot: ReturnType<typeof useFinance> | null = null;

/** Keeps the inbox fresh and, when you've turned it on, adds the messages it's sure about by itself. */
export function SmsSync() {
  const f = useFinance();
  useEffect(() => {
    snapshot = f;
  }, [f]);
  const refresh = useSms((s) => s.refresh);
  const rows = useSms((s) => s.rows);
  const items = useSmsItems();
  const prefs = f.ds.profile.preferences?.sms;
  const busy = useRef(false);
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!smsAvailable()) return;
    void refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
    };
  }, [refresh]);

  // A message you opened in the full form is done once that entry is saved.
  useEffect(() => {
    for (const r of rows) {
      if (r.status !== "new") continue;
      const t = f.ds.transactions.find((x) => x.tags?.includes(`sms:${r.id}`));
      if (t) void useSms.getState().mark(r.id, "added", t.id);
    }
  }, [rows, f.ds.transactions]);

  useEffect(() => {
    if (busy.current || !items.length) return;
    const todo = items.filter((i) => !tried.current.has(i.row.id) && (i.p.state === "ignore" || i.p.state === "duplicate" || (prefs?.autoAdd && i.p.state === "ready")));
    if (!todo.length) return;
    busy.current = true;
    void (async () => {
      let added = 0;
      try {
        // Oldest first, so balances end on the latest message.
        for (const it of [...todo].reverse()) {
          tried.current.add(it.row.id);
          if (it.p.state === "ignore") await useSms.getState().mark(it.row.id, "ignored");
          else if (it.p.state === "duplicate") await useSms.getState().mark(it.row.id, "added", it.p.duplicateOf?.id ?? null);
          else {
            const latest = !todo.some((o) => o !== it && o.p.balance?.accountId === it.p.balance?.accountId && o.row.received_at > it.row.received_at);
            await addItem(it, prefs?.matchBalance !== false, latest);
            added++;
          }
        }
      } catch {
        /* the store shows the error; the message stays in the inbox */
      } finally {
        busy.current = false;
      }
      if (added) toast.success(`${added} payment${added === 1 ? "" : "s"} added from bank SMS`);
    })();
  }, [items, prefs?.autoAdd, prefs?.matchBalance]);

  return <SmsInboxSheet />;
}

/** "3 bank messages to check" — on Home, only when something is waiting. */
export function SmsBanner() {
  const { ctx } = useFinance();
  const items = useSmsItems().filter((i) => i.p.state === "ready" || i.p.state === "check");
  if (!items.length) return null;
  return (
    <button type="button" onClick={() => useSms.getState().openSheet(true)} className="flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-left hover:bg-brand/15">
      <MessageSquareText className="h-5 w-5 shrink-0 text-brand" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold">
          {items.length} bank message{items.length === 1 ? "" : "s"} to check
        </span>
        <span className="block truncate text-[12.5px] text-ink-2">{items.map((i) => (i.p.tx ? formatMoney(i.p.tx.amount, ctx) : "?")).join(" · ")}</span>
      </span>
      <span className="text-[13px] font-medium text-brand">Review</span>
    </button>
  );
}

function SmsInboxSheet() {
  const open = useSms((s) => s.sheet);
  // Everything still waiting, including messages that aren't payments (so they can be cleared with one tap).
  const items = useSmsItems().filter((i) => i.p.state !== "duplicate");
  const { ds, ctx } = useFinance();
  const [busy, setBusy] = useState<string | null>(null);
  if (!open) return null;
  const close = () => useSms.getState().openSheet(false);
  const matchBalance = ds.profile.preferences?.sms?.matchBalance !== false;
  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch {
      /* shown by the store */
    } finally {
      setBusy(null);
    }
  };
  const ready = items.filter((i) => i.p.state === "ready");
  const name = (id?: string | null) => (id ? ds.accounts.find((a) => a.id === id)?.name : null) ?? "which account?";
  const where = (p: SmsProposal) => (p.tx?.type === "transfer" ? `${name(p.tx.account_id)} → ${name(p.tx.to_account_id)}` : (p.card?.name ?? p.account?.name ?? null));
  return (
    <Sheet
      open
      onClose={close}
      size="md"
      title="Bank messages"
      description="Payments read from your bank SMS. Add them as they are, change them first, or ignore."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={close}>Close</Button>
          {ready.length > 1 && (
            <Button
              variant="primary"
              loading={busy === "all"}
              onClick={() =>
                run("all", async () => {
                  for (const it of [...ready].reverse()) await addItem(it, matchBalance, !ready.some((o) => o !== it && o.p.balance?.accountId === it.p.balance?.accountId && o.row.received_at > it.row.received_at));
                  toast.success(`${ready.length} added`);
                })
              }
            >
              Add all {ready.length} that look right
            </Button>
          )}
        </div>
      }
    >
      {items.length === 0 ? (
        <p className="text-[14px] text-ink-2">Nothing waiting. New bank messages show up here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => {
            const { row, p } = it;
            const tx = p.tx;
            return (
              <li key={row.id} className="rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {tx ? (
                      <>
                        <p className="text-[14.5px] font-semibold">
                          {tx.description || TYPE_WORD[tx.type] || "Payment"}
                          {p.event && <span className="ml-1.5 rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-medium text-ok">pays planned</span>}
                        </p>
                        <p className="text-[12.5px] text-ink-3">
                          {[TYPE_WORD[tx.type] ?? tx.type, where(p), formatDate(tx.date, "short"), tx.category].filter(Boolean).join(" · ")}
                        </p>
                      </>
                    ) : (
                      <p className="text-[14px] font-semibold">{p.state === "ignore" ? "Not a payment" : "Couldn't read this one"}</p>
                    )}
                    {p.reason && <p className="mt-0.5 text-[12.5px] font-medium text-warn">{p.reason}</p>}
                  </div>
                  {tx && <Money value={tx.type === "income" || (tx.type === "card_payment" && tx.tags?.includes("refund")) ? tx.amount : -tx.amount} decimals tone="auto" className="shrink-0 text-[15px] font-semibold" />}
                </div>
                <p className="mt-2 line-clamp-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-2">{row.body}</p>
                {p.balance && (
                  <p className="mt-1 text-[12px] text-ink-3">
                    Bank says balance {formatMoney(p.balance.bank, ctx, { decimals: true })}
                    {matchBalance ? " — the account will be matched to it." : "."}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.state === "ignore" && (
                    <Button size="sm" variant="primary" icon={<X className="h-3.5 w-3.5" />} onClick={() => run(row.id, () => useSms.getState().mark(row.id, "ignored"))}>
                      Ignore — nothing to add
                    </Button>
                  )}
                  {p.state !== "ignore" && tx && (p.account || p.card) && (
                    <Button size="sm" variant="primary" loading={busy === row.id} icon={<Check className="h-3.5 w-3.5" />} onClick={() => run(row.id, () => addItem(it, matchBalance, true))}>
                      Add
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => {
                      close();
                      useUI.getState().openTx({ ...(tx ?? { type: "expense", amount: p.parsed.amount ?? undefined, date: row.received_at.slice(0, 10) }), tags: [...(tx?.tags ?? []), `sms:${row.id}`] } as Partial<Transaction>);
                    }}
                  >
                    Change & add
                  </Button>
                  {p.state !== "ignore" && (
                    <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => run(row.id, () => useSms.getState().mark(row.id, "ignored"))}>
                      Ignore
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Menu → Bank SMS: set up the iPhone shortcut, choose what happens, see what came in.

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-ink-3">{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12.5px]">{shown ? value : "•".repeat(24)}</code>
        {secret && (
          <Button size="sm" variant="ghost" onClick={() => setShown((v) => !v)}>
            {shown ? "Hide" : "Show"}
          </Button>
        )}
        <Button
          size="sm"
          icon={<Copy className="h-3.5 w-3.5" />}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(
              () => toast.success("Copied"),
              () => toast.error("Couldn't copy — select it and copy"),
            );
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}

/** The names banks use for you ("ABILASH N"), so money you send to yourself is a transfer, not spending. */
function SelfNames({ names, onSave }: { names: string[]; onSave: (n: string[]) => void }) {
  const [v, setV] = useState(names.join(", "));
  const save = () => onSave(v.split(",").map((x) => x.trim()).filter(Boolean));
  return (
    <div>
      <label htmlFor="sms-self" className="text-[13px] font-medium text-ink-2">
        Your name as banks write it
      </label>
      <div className="mt-1 flex gap-2">
        <input id="sms-self" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} placeholder="e.g. ABILASH N" className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[14px]" />
        <Button size="sm" onClick={save}>
          Save
        </Button>
      </div>
      <p className="mt-1 text-[12px] text-ink-3">Money sent to or received from this name is treated as a transfer between your own accounts. Separate several with commas.</p>
    </div>
  );
}

export function SmsScreen() {
  const { ds, ctx } = useFinance();
  const items = useSmsItems();
  const { rows, key, loaded, refresh } = useSms();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const updatePrefs = useStore((s) => s.updatePrefs);
  const prefs = ds.profile.preferences?.sms ?? {};
  const available = smsAvailable();
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const missing = [...ds.accounts.filter((a) => !a.archived && a.type !== "cash" && a.type !== "wallet" && !a.last4 && !a.card_last4).map((a) => a.name), ...ds.credit_cards.filter((c) => !c.archived && !c.last4).map((c) => c.name)];

  if (!available) {
    return (
      <>
        <V2PageHeader title="Bank SMS" />
        <p className="rounded-2xl border border-line bg-surface p-4 text-[14px] text-ink-2">Bank SMS import needs you to be signed in, because your phone sends the messages to your account. It isn&apos;t available in &quot;on this device only&quot; mode.</p>
      </>
    );
  }

  const make = async () => {
    setBusy(true);
    try {
      setNewKey(await useSms.getState().createKey());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make a key");
    } finally {
      setBusy(false);
    }
  };

  const steps: { t: string; d: React.ReactNode }[] = [
    { t: "Open Shortcuts → Automation → New Automation → Message", d: <>Set <b>Message Contains</b> to <code>Rs</code>. Leave Sender empty. Choose <b>Run Immediately</b> and turn off <b>Notify When Run</b>.</> },
    { t: "Add the action “Get Contents of URL”", d: <>Paste the <b>Address</b> below. Tap <b>Show More</b>: Method <b>POST</b>.</> },
    { t: "Add two headers", d: <><code>apikey</code> = the App key below, and <code>Content-Type</code> = <code>application/json</code>.</> },
    {
      t: "Request Body: JSON, with three Text fields",
      d: (
        <>
          <code>key</code> = your personal key (paste it). For <code>body</code> and <code>sender</code>, <b>don&apos;t type anything</b>: tap the empty value box, then tap <b>Shortcut Input</b> in the bar above the keyboard. Tap the blue <b>Shortcut Input</b> bubble it adds and choose <b>Content</b> for <code>body</code>, and <b>Sender</b> for <code>sender</code>. Each value should be just one blue bubble.
        </>
      ),
    },
    { t: "Check the headers", d: <>Only two headers — delete any empty row (an empty header stops the request).</> },
    { t: "Make two more the same way", d: <>Duplicate the automation for <code>INR</code> and for <code>debited</code>, so every bank's wording is caught. A message caught twice is only kept once.</> },
  ];

  const recent = rows.slice(0, 50);
  const waiting = new Map(items.map((i) => [i.row.id, i]));
  const toReview = items.filter((i) => i.p.state === "ready" || i.p.state === "check").length;
  const setupOpen = !key || !rows.length;
  const txOf = (id: string | null) => (id ? ds.transactions.find((t) => t.id === id) : undefined);
  const WORD: Record<string, string> = { transfer: "Self transfer", card_spend: "Card spend", card_payment: "Card bill paid", expense: "Spent", income: "Received" };
  return (
    <>
      <V2PageHeader title="Bank SMS" />
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <section className="rounded-2xl border border-line bg-surface">
          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-[15px] font-semibold">Received</h2>
              <p className="text-[12px] text-ink-3">{key?.last_used_at ? `Last message ${formatDate(key.last_used_at.slice(0, 10), "short")}` : key ? "Set up — waiting for the first message" : "Not set up yet"}</p>
            </div>
            <div className="flex gap-1.5">
              {toReview > 0 && (
                <Button size="sm" variant="primary" onClick={() => useSms.getState().openSheet(true)}>
                  Review {toReview}
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void refresh()}>
                Refresh
              </Button>
            </div>
          </div>
          {!loaded ? (
            <p className="px-4 pb-4 text-[13.5px] text-ink-3 sm:px-5">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="px-4 pb-4 text-[13.5px] text-ink-2 sm:px-5">Nothing yet. Set up the shortcut below.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {recent.map((r) => {
                const t = txOf(r.transaction_id);
                return (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
                    <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", r.status === "added" ? "bg-ok/15 text-ok" : r.status === "ignored" ? "bg-surface-3 text-ink-3" : "bg-warn/15 text-warn")}>
                      {r.status === "added" ? "Added" : r.status === "ignored" ? "Ignored" : "Waiting"}
                    </span>
                    <span className="min-w-0 flex-1">
                      {t && (
                        <button type="button" onClick={() => useUI.getState().openTx(null, t)} className="block text-left text-[13px] font-medium hover:underline">
                          {[WORD[t.type] ?? t.type, t.description && t.description !== WORD[t.type] ? t.description : null, formatMoney(t.amount, ctx)].filter(Boolean).join(" · ")}
                        </button>
                      )}
                      {r.status === "new" && waiting.get(r.id)?.p.reason && <span className="block text-[12.5px] font-medium text-warn">{waiting.get(r.id)?.p.reason}</span>}
                      <span className="line-clamp-2 block text-[12.5px] text-ink-2">{r.body}</span>
                      <span className="block text-[11.5px] text-ink-3">
                        {r.sender ? `${r.sender} · ` : ""}
                        {formatDate(r.received_at.slice(0, 10), "short")}
                      </span>
                    </span>
                    {r.status === "new" && waiting.get(r.id)?.p.state === "ignore" ? (
                      <Button size="sm" onClick={() => void useSms.getState().mark(r.id, "ignored")} title={waiting.get(r.id)?.p.reason}>
                        Ignore
                      </Button>
                    ) : r.status === "new" ? (
                      <Button size="sm" onClick={() => useSms.getState().openSheet(true)}>
                        Review
                      </Button>
                    ) : r.status === "ignored" ? (
                      <Button size="sm" variant="ghost" onClick={() => void useSms.getState().mark(r.id, "new")}>
                        Look again
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold">How messages are matched</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">By the last 4 digits of the account, debit card or credit card.</p>
          {missing.length > 0 ? (
            <p className="mt-2 text-[13px] text-warn">
              Add the last 4 digits to: {missing.join(", ")}. Edit them in <Link className="underline" href="/my-money?tab=accounts">My Money</Link> and <Link className="underline" href="/to-pay?tab=cards">To Pay → Credit cards</Link>.
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-ok">Every account and card has its last digits.</p>
          )}
          <div className="mt-3 border-t border-line pt-3">
            <SelfNames names={prefs.selfNames ?? []} onSave={(n) => void updatePrefs({ sms: { ...prefs, selfNames: n } })} />
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
            <Switch
              checked={!!prefs.autoAdd}
              onChange={(v) => void updatePrefs({ sms: { ...prefs, autoAdd: v } })}
              label="Add payments by themselves"
              help="Messages that clearly match an account or card are added without asking. Unsure ones still wait for you."
            />
            <Switch
              checked={prefs.matchBalance !== false}
              onChange={(v) => void updatePrefs({ sms: { ...prefs, matchBalance: v } })}
              label="Match balances to the SMS"
              help="When a message says the balance left, the account is set to it (a small correction entry is added)."
            />
          </div>
        </section>

        <details open={setupOpen} className="group rounded-2xl border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <span className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-brand" aria-hidden />
              <span className="text-[15px] font-semibold">Set up on your iPhone</span>
            </span>
            <span className="text-[12.5px] text-ink-3 group-open:hidden">{key ? "Done · show steps" : "Show steps"}</span>
            <span className="hidden text-[12.5px] text-ink-3 group-open:inline">Hide</span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-line px-4 py-4 sm:px-5">
            <p className="text-[13.5px] text-ink-2">
              iPhones don&apos;t let apps read your messages. Apple&apos;s free <b>Shortcuts</b> app can send just your bank messages here when they arrive. Only messages about money are kept; OTPs and everything else are dropped before they&apos;re saved. Payments wait here until you open the app.
            </p>
            <div>
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                <KeyRound className="h-4 w-4 text-ink-3" aria-hidden /> 1 · Your personal key
              </h3>
              {newKey ? (
                <div className="mt-2 flex flex-col gap-3">
                  <p className="text-[13px] font-medium text-warn">Copy it into the shortcut now — it&apos;s shown only once.</p>
                  <CopyField label="Personal key" value={newKey} />
                </div>
              ) : key ? (
                <p className="mt-1 text-[13.5px] text-ink-2">Made {formatDate(key.created_at.slice(0, 10))}.</p>
              ) : (
                <p className="mt-1 text-[13.5px] text-ink-2">Make a key for your phone. Anyone with it can add messages to your inbox (nothing else), so keep it to yourself.</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant={key ? "secondary" : "primary"} loading={busy} icon={<KeyRound className="h-4 w-4" />} onClick={make}>
                  {key ? "Make a new key (the old one stops working)" : "Make my key"}
                </Button>
                {key && (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void useSms.getState().removeKey().then(() => toast.success("Key removed — the phone can't send any more"))}>
                    Turn off
                  </Button>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold">2 · Make the shortcut (about 5 minutes, once)</h3>
              <ol className="mt-2 flex flex-col gap-3">
                {steps.map((st, i) => (
                  <li key={st.t} className="flex gap-3">
                    <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-inverse text-[12px] font-semibold text-on-inverse">{i + 1}</span>
                    <span className="min-w-0 text-[13.5px]">
                      <span className="block font-medium">{st.t}</span>
                      <span className="block text-ink-2">{st.d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <CopyField label="Address" value={INGEST_URL} />
                <CopyField label="App key (apikey header — this one is public)" value={INGEST_API_KEY} />
              </div>
              <p className="mt-2 text-[12.5px] text-ink-3">To test: send yourself a text like “Rs 1 debited from A/c XX1234”. It appears under Received within a minute of opening the app.</p>
            </div>
          </div>
        </details>
      </div>
    </>
  );
}
