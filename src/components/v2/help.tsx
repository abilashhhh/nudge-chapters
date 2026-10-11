"use client";

import { Coffee, Share2 } from "lucide-react";
import { toast } from "sonner";
import { APP_NAME, BMC_URL, appUrl } from "@/lib/config";
import { BmcButton } from "../support";
import { Button } from "../ui/button";
import { Panel } from "../ui/misc";
import { V2PageHeader } from "./ui";
import { AppVersionPanel } from "./version-switch";

const FAQ: [string, string][] = [
  ["What is “Free to spend this month”?", "Money in your bank, minus everything you still have to pay this month (bills, EMIs, card bills, chits, SIPs) and what's left in your budgets. Tap the number on Home to see each line."],
  ["Why is an amount in violet?", "Violet amounts with a dotted line are estimates — for example a card bill that isn't generated yet, or money in your bank a year from now. Normal amounts are known."],
  ["Is an EMI on my card counted twice?", "No. An EMI on a credit card is part of that card's bill. In To Pay → Credit cards the card total already includes it, and the grand total adds card totals only."],
  ["How do I mark something as paid?", "Tap the amount in any month table (or a row in Upcoming payments on Home). Choose Mark paid, Change amount (this month only), Skip, or Move date."],
  ["Someone pays me back for an EMI on my card — how do I track it?", "Edit the EMI and set who it's for. It then shows in My Money → People owe me with the months they should pay you."],
  ["Does the app read my bank account?", "No. Nothing is fetched from your bank. You add balances and payments yourself, and use Fix balance when the app and your bank app differ."],
  ["Where did Reports, the What-if tools and the other screens go?", "They're in Version 1. Switch in Settings → Look & version (or below). Your data is the same in both versions."],
  ["Can I get my data out?", "Yes. Every month table has Download Excel, and Settings → Import & export gives you a full backup, an Excel file of everything, or a CSV of your entries."],
];

export function HelpScreen() {
  const share = async () => {
    const data = { title: APP_NAME, text: `I use ${APP_NAME} to see where my money is heading — try it:`, url: appUrl("/") };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.url);
        toast.success("Link copied");
      }
    } catch {
      /* cancelled */
    }
  };
  return (
    <>
      <V2PageHeader title="Help & support" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Questions">
          <div className="divide-y divide-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-2.5">
                <summary className="cursor-pointer list-none text-[14.5px] font-medium marker:hidden">
                  <span className="mr-2 inline-block text-ink-3 transition-transform group-open:rotate-90" aria-hidden>
                    ›
                  </span>
                  {q}
                </summary>
                <p className="mt-1.5 pl-5 text-[13.5px] text-ink-2">{a}</p>
              </details>
            ))}
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Tell a friend">
            <div className="flex flex-col gap-2">
              <Button icon={<Share2 className="h-4 w-4" />} onClick={share}>
                Share {APP_NAME} with a friend
              </Button>
            </div>
          </Panel>
          {BMC_URL && (
            <Panel title="Buy me a coffee">
              <p className="mb-3 flex items-start gap-2 text-[13.5px] text-ink-2">
                <Coffee className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {APP_NAME} is free, with no ads. If it helps you, a coffee keeps it going. Nothing about your money is shared.
              </p>
              <BmcButton />
            </Panel>
          )}
        </div>
      </div>
      <AppVersionPanel className="mt-4" />
    </>
  );
}
