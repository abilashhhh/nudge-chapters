"use client";

import { CalendarClock, Check, CircleSlash, Pencil, RotateCcw, SkipForward } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { addDays, formatDate, relativeDays } from "@/lib/dates";
import { buildEvents, isPending, settlementDraft, SETTLED, type FinEvent } from "@/lib/engine/events";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import { useUI } from "@/lib/ui";
import type { EventOverride } from "@/lib/types";
import { Money } from "./money";
import { Button } from "./ui/button";
import { AmountInput, DateInput, Field, Select, Switch } from "./ui/form";
import { KV, StatusPill } from "./ui/misc";
import { ConfirmSheet, Sheet } from "./ui/sheet";

export function useEventLookup() {
  const { events, ds, today, positions, assumptions } = useFinance();
  return (key: string | null): FinEvent | null => {
    if (!key) return null;
    const hit = events.find((e) => e.key === key);
    if (hit) return hit;
    const date = key.split(":").at(-1) ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const more = buildEvents(ds, { from: addDays(date, -1), to: addDays(date, 1), today, positions, scenario: assumptions.scenarios.base });
    return more.find((e) => e.key === key) ?? null;
  };
}

export function EventSheet() {
  const key = useUI((s) => s.eventKey);
  const initialMode = useUI((s) => s.eventMode);
  const close = () => useUI.getState().openEvent(null);
  const lookup = useEventLookup();
  const e = useMemo(() => lookup(key), [key, lookup]);
  if (!key) return null;
  if (!e) {
    return (
      <Sheet open onClose={close} title="Item not found" size="sm">
        <p className="text-ink-2">This planned item no longer exists — its source may have been changed or deleted.</p>
      </Sheet>
    );
  }
  return <EventDetail key={e.key} e={e} onClose={close} initialMode={isPending(e) ? initialMode : "view"} />;
}

type Mode = "view" | "settle" | "reschedule" | "amount";

function EventDetail({ e, onClose, initialMode = "view" }: { e: FinEvent; onClose: () => void; initialMode?: "view" | "settle" }) {
  const { ds, today, positions, ctx } = useFinance();
  const add = useStore((s) => s.add);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [amount, setAmount] = useState<number | null>(e.remaining || e.amount);
  // If you're marking it now, it happened today (editable for back-dating or scheduled payments).
  const [date, setDate] = useState(today);
  const activeAccounts = useMemo(() => ds.accounts.filter((a) => !a.archived), [ds.accounts]);
  // Bills and card bills have no fixed account, so you pick one each time (pre-filled only when there's a single account).
  const [account, setAccount] = useState<string>(e.accountId ?? (activeAccounts.length === 1 ? activeAccounts[0].id : ""));
  // Accounts this item was paid from / received into before, most recent first — offered as one-tap choices.
  const recentAccounts = useMemo(() => {
    const related = ds.transactions
      .filter(
        (t) =>
          t.account_id &&
          ((e.ruleId && t.rule_id === e.ruleId) ||
            (e.kind === "card_bill" && e.cardId && t.type === "card_payment" && t.card_id === e.cardId) ||
            (e.chitId && t.chit_id === e.chitId) ||
            (e.loanId && t.loan_id === e.loanId) ||
            (e.lendingId && t.lending_id === e.lendingId)),
      )
      .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
    const out: string[] = [];
    for (const t of related) if (!out.includes(t.account_id!) && activeAccounts.some((a) => a.id === t.account_id)) out.push(t.account_id!);
    return out.slice(0, 3);
  }, [ds.transactions, activeAccounts, e.ruleId, e.kind, e.cardId, e.chitId, e.loanId, e.lendingId]);
  const [partial, setPartial] = useState(false);
  const [newDate, setNewDate] = useState(e.date);
  const [newAmount, setNewAmount] = useState<number | null>(e.amount);
  const [busy, setBusy] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const pending = isPending(e);
  const settled = SETTLED.includes(e.status);
  const flowIn = e.flow === "in";
  const isCountBased = e.source === "loan" || (e.source === "chit" && e.kind === "chit");
  const canSkip = !isCountBased && e.kind !== "lend_due" && e.kind !== "borrow_due" && e.kind !== "chit_payout";
  const canAdjust = e.source === "rule" || e.source === "sip" || e.source === "card" || e.source === "task";
  const override = ds.event_overrides.find((o) => o.source_type === e.source && o.source_id === e.sourceId && o.occurrence_date === e.occurrence);
  const isCardOnly = e.kind === "card_spend" || (e.kind === "emi" && e.flow === "none");
  const accountName = (id?: string | null) => ds.accounts.find((a) => a.id === id)?.name;
  const cardName = (id?: string | null) => ds.credit_cards.find((c) => c.id === id)?.name;

  const upsertOverride = async (o: Partial<EventOverride>) => {
    if (e.source === "task") {
      // Task costs live on the task itself: move its date, change its estimate, or drop it.
      const item = ds.life_items.find((x) => x.id === e.sourceId);
      if (!item) return;
      if (o.action === "reschedule" && o.new_date) await patch("life_items", item.id, { due_date: o.new_date });
      else if (o.action === "adjust" && o.new_amount != null) await patch("life_items", item.id, { data: { ...item.data, estimated_cost: o.new_amount } });
      else await patch("life_items", item.id, { status: "done", completed_at: new Date().toISOString() });
      return;
    }
    const body = { source_type: e.source, source_id: e.sourceId, occurrence_date: e.occurrence, new_date: null, new_amount: null, ...o } as Partial<EventOverride>;
    if (override) await patch("event_overrides", override.id, body);
    else await add("event_overrides", body);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  };

  const needsAccount = !isCardOnly && e.kind !== "card_statement";
  const settle = () =>
    run(async () => {
      if (!amount || amount <= 0) return;
      if (needsAccount && !account) {
        toast.error(`Choose the account it was ${flowIn ? "received into" : "paid from"}.`);
        throw new Error("account required");
      }
      const draft = settlementDraft(e, { amount, date, accountId: isCardOnly ? null : account || null, partial });
      if (e.kind === "emi" && e.loanId) {
        // EMIs are matched by order; record against this installment.
        draft.occurrence_date = e.occurrence;
      }
      await add("transactions", draft);
      if (e.kind === "chit_payout" && e.chitId) await patch("chits", e.chitId, { payout_status: "received", payout_amount: amount, payout_date: date });
    });

  const alreadyCounted = () =>
    run(async () => {
      if (e.source === "loan" && e.loanId) {
        const l = ds.loans.find((x) => x.id === e.loanId);
        if (l) await patch("loans", l.id, { emis_paid_offset: l.emis_paid_offset + 1 });
      } else if (e.source === "chit" && e.kind === "chit" && e.chitId) {
        const c = ds.chits.find((x) => x.id === e.chitId);
        if (c) await patch("chits", c.id, { installments_paid_offset: c.installments_paid_offset + 1 });
      } else if (e.kind === "chit_payout" && e.chitId) {
        await patch("chits", e.chitId, { payout_status: "received" });
      } else if (e.lendingId) {
        // Reduce what's owed without moving cash (no account), since the balance already has it.
        await add("transactions", {
          date: today,
          type: e.kind === "lend_due" ? "lend_repayment" : "borrow_repayment",
          amount: e.remaining,
          account_id: null,
          lending_id: e.lendingId,
          description: "Settled — already reflected in balance",
          is_partial: false,
          reconciled: false,
          tags: [],
        });
      } else {
        await upsertOverride({ action: "cancel" });
      }
    });

  const undo = async () => {
    for (const id of e.txIds) await remove("transactions", id);
    if (override) await remove("event_overrides", override.id);
    onClose();
  };

  const openSource = () => {
    const ui = useUI.getState();
    onClose();
    if (e.ruleId) ui.openEditor("rule", e.ruleId);
    else if (e.loanId) ui.openEditor("loan", e.loanId);
    else if (e.chitId) ui.openEditor("chit", e.chitId);
    else if (e.investmentId) ui.openEditor("investment", e.investmentId);
    else if (e.lendingId) ui.openEditor("lending", e.lendingId);
    else if (e.statementId) ui.openEditor("statement", e.statementId);
    else if (e.cardId) ui.openEditor("card", e.cardId);
  };

  const verb = flowIn ? "received" : isCardOnly ? "logged" : "paid";
  const sourceLabel = e.ruleId ? "Edit the recurring item" : e.loanId ? "Open loan" : e.chitId ? "Open chit" : e.investmentId ? "Open investment" : e.lendingId ? "Open lending record" : e.statementId ? "Edit statement" : e.cardId ? "Open card" : null;

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={e.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusPill status={e.status} flowIn={flowIn} />
            <span>
              {formatDate(e.date, "long")} · {relativeDays(today, e.date)}
            </span>
          </span>
        }
        size="sm"
        footer={
          mode === "view" ? (
            <div className="flex flex-wrap justify-end gap-2">
              {sourceLabel && (
                <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={openSource}>
                  {sourceLabel}
                </Button>
              )}
              {pending && e.kind !== "card_statement" && (
                <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => setMode("settle")}>
                  Mark {verb}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button onClick={() => setMode("view")}>Back</Button>
              {mode === "settle" && (
                <Button variant="primary" loading={busy} onClick={settle} disabled={!amount || (needsAccount && !isCardOnly && !account)}>
                  Save as {verb}
                </Button>
              )}
              {mode === "reschedule" && (
                <Button
                  variant="primary"
                  loading={busy}
                  onClick={() =>
                    run(async () => {
                      if (e.lendingId) await patch("lendings", e.lendingId, { expected_date: newDate });
                      else if (e.kind === "chit_payout" && e.chitId) await patch("chits", e.chitId, { payout_date: newDate });
                      else await upsertOverride({ action: "reschedule", new_date: newDate });
                    })
                  }
                >
                  Move to {formatDate(newDate, "short")}
                </Button>
              )}
              {mode === "amount" && (
                <Button variant="primary" loading={busy} onClick={() => run(() => upsertOverride({ action: "adjust", new_amount: newAmount ?? 0 }))}>
                  Use this amount
                </Button>
              )}
            </div>
          )
        }
      >
        {mode === "view" && (
          <div>
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="text-[13px] text-ink-3">{settled ? "Amount" : e.paid > 0 ? "Still to " + (flowIn ? "receive" : "pay") : "Expected amount"}</p>
              <p className="display mt-0.5 text-[32px] font-semibold leading-none">
                <Money value={settled ? e.paid || e.amount : e.remaining} projected={!settled && e.estimated} />
              </p>
              {e.paid > 0 && !settled && <p className="mt-1 text-[13px] text-ink-2">{formatMoney(e.paid, ctx)} already {verb} of {formatMoney(e.amount, ctx)}</p>}
              {e.status === "adjusted" && <p className="mt-1 text-[13px] text-ink-2">Planned {formatMoney(e.amount, ctx)}; actual differed.</p>}
              {e.estimated && !settled && <p className="mt-2 text-[12.5px] text-future-ink">This is an estimate based on your plans.</p>}
            </div>
            <div className="mt-3 divide-y divide-line">
              {e.accountId && <KV k={flowIn ? "Into" : "From"} v={accountName(e.accountId) ?? "—"} />}
              {e.toAccountId && <KV k="To" v={accountName(e.toAccountId) ?? "—"} />}
              {e.cardId && <KV k="Card" v={cardName(e.cardId) ?? "—"} />}
              {e.category && <KV k="Category" v={e.category} />}
              {e.installment && <KV k="Installment" v={`${e.installment} of ${e.installments}`} />}
              {e.principal != null && <KV k="Principal / interest" v={`${formatMoney(e.principal, ctx)} / ${formatMoney(e.interest ?? 0, ctx)}`} />}
              {e.budget && <KV k="Budget used" v={`${formatMoney(e.budget.spent, ctx)} of ${formatMoney(e.budget.limit, ctx)} until ${formatDate(e.budget.periodEnd, "short")}`} />}
              {e.occurrence !== e.date && <KV k="Originally due" v={formatDate(e.occurrence)} />}
              <KV k="Certainty" v={e.certainty === "known" ? "Known" : e.certainty === "expected" ? "Expected" : "Uncertain"} />
            </div>

            {pending && !e.budget && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {canSkip && (
                  <Button size="sm" icon={<SkipForward className="h-4 w-4" />} onClick={() => run(() => upsertOverride({ action: "skip" }))} loading={busy}>
                    Skip this one
                  </Button>
                )}
                {!isCountBased && (
                  <Button size="sm" icon={<CalendarClock className="h-4 w-4" />} onClick={() => setMode("reschedule")}>
                    Reschedule
                  </Button>
                )}
                {canAdjust && (
                  <Button size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setMode("amount")}>
                    Change amount
                  </Button>
                )}
                <Button size="sm" icon={<CircleSlash className="h-4 w-4" />} onClick={alreadyCounted} loading={busy}>
                  Already in balance
                </Button>
              </div>
            )}
            {pending && !e.budget && (
              <p className="mt-2 text-[12px] text-ink-3">
                &ldquo;Already in balance&rdquo; marks it done without changing any balance — use it when the account balance you entered already includes this.
              </p>
            )}
            {(settled || override) && e.status !== "planned" && (e.txIds.length > 0 || override) && !e.budget && (
              <Button className="mt-4" size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmUndo(true)}>
                Undo — make it {pending ? "planned" : "unpaid"} again
              </Button>
            )}
          </div>
        )}

        {mode === "settle" && (
          <div className="flex flex-col gap-4">
            <Field label="Amount" htmlFor="ev-amt">
              <AmountInput id="ev-amt" large autoFocus value={amount} onChange={setAmount} />
            </Field>
            {!isCardOnly && (
              <div className="flex flex-col gap-2">
                <Field
                  label={flowIn ? "Received into" : "Paid from"}
                  htmlFor="ev-acct"
                  help={e.accountId ? undefined : `Which account did this ${flowIn ? "arrive in" : "come out of"} this time?`}
                >
                  <Select id="ev-acct" value={account} onChange={(x) => setAccount(x.target.value)}>
                    <option value="">Choose an account</option>
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {formatMoney(positions.accounts.get(a.id)?.balance ?? 0, ctx)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {recentAccounts.length > 0 && activeAccounts.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Recently used accounts">
                    <span className="text-[12.5px] text-ink-3">Recently used:</span>
                    {recentAccounts.map((id) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={account === id}
                        onClick={() => setAccount(id)}
                        className={cn(
                          "h-8 rounded-full border px-3 text-[13px] transition-colors",
                          account === id ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                        )}
                      >
                        {accountName(id)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Field label="Date" htmlFor="ev-date">
              <DateInput id="ev-date" value={date} onChange={(x) => setDate(x.target.value)} />
            </Field>
            {!isCountBased && amount != null && amount < e.remaining - 0.5 && (
              <Switch checked={partial} onChange={setPartial} label="Part payment — more to come" help="Keeps the rest as still due. Leave off if this amount settles it in full." />
            )}
            {e.kind === "card_bill" && <p className="text-[12.5px] text-ink-3">Paying the bill reduces what you owe on the card. It isn&apos;t counted as a new expense.</p>}
            {e.kind === "chit" && e.estimated && (
              <p className="rounded-xl bg-future-soft px-3 py-2 text-[12.5px] text-future-ink">
                This month&apos;s auction result isn&apos;t entered, so the amount above is an estimate. Enter what you actually paid — it becomes this installment&apos;s actual amount.
              </p>
            )}
          </div>
        )}

        {mode === "reschedule" && (
          <Field label="New date" htmlFor="ev-new-date">
            <DateInput id="ev-new-date" value={newDate} onChange={(x) => setNewDate(x.target.value)} />
          </Field>
        )}

        {mode === "amount" && (
          <Field label="Expected amount for this occurrence" help="Only this one changes. Edit the recurring item to change all future ones." htmlFor="ev-new-amt">
            <AmountInput id="ev-new-amt" large value={newAmount} onChange={setNewAmount} />
          </Field>
        )}
      </Sheet>
      <ConfirmSheet
        open={confirmUndo}
        onClose={() => setConfirmUndo(false)}
        title="Undo this?"
        body={e.txIds.length ? `This deletes the ${e.txIds.length > 1 ? `${e.txIds.length} linked transactions` : "linked transaction"} and puts the item back to unpaid.` : "The item goes back to its planned state."}
        confirmLabel="Undo"
        danger={e.txIds.length > 0}
        onConfirm={undo}
      />
    </>
  );
}
