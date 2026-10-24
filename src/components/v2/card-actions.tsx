"use client";

import { ArrowRight, MoreHorizontal, Pencil, Plus, Receipt } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CreditCard } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { Button } from "../ui/button";

/** The one row of card actions, the same on the card's page and in To Pay → Credit cards. */
export function CardActions({ card, size, open }: { card: CreditCard; size?: "sm"; open?: boolean }) {
  const ui = useUI.getState();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const icon = "h-4 w-4";
  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} variant="primary" icon={<Plus className={icon} />} onClick={() => ui.openTx({ type: "card_spend", card_id: card.id })}>
        Add spend
      </Button>
      <Button size={size} icon={<Receipt className={icon} />} onClick={() => ui.openTx({ type: "card_payment", card_id: card.id })}>
        Pay bill
      </Button>
      {open && (
        <Button size={size} icon={<ArrowRight className={icon} />} onClick={() => router.push(`/to-pay/card?id=${card.id}`)}>
          Open card
        </Button>
      )}
      {more ? (
        <>
          <Button size={size} variant="ghost" icon={<Pencil className={icon} />} onClick={() => ui.openEditor("card", card.id)}>
            Edit card
          </Button>
          <Button size={size} variant="ghost" onClick={() => ui.openEditor("statement", undefined, { card_id: card.id })}>
            Add bill from statement
          </Button>
          <Button size={size} variant="ghost" onClick={() => ui.openEditor("loan", undefined, { type: "card_emi", card_id: card.id, payment_account_id: null, name: `${card.name} EMI` })}>
            Change to EMI
          </Button>
        </>
      ) : (
        <Button size={size} variant="ghost" icon={<MoreHorizontal className={icon} />} onClick={() => setMore(true)} aria-expanded={false}>
          More
        </Button>
      )}
    </div>
  );
}

/** "Pay everything by 31 Oct" or "Bill on the 9th · due on the 30th". */
export function cardDatesLabel(card: CreditCard): string {
  if (card.pay_by_month_end) return "Pay everything by the end of each month";
  return `Bill on the ${ordinal(card.statement_day)} · due on the ${ordinal(card.due_day)}`;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
