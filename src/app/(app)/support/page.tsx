"use client";

import { Coffee, Heart, Share2 } from "lucide-react";
import { toast } from "sonner";
import { BmcButton } from "@/components/support";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";
import { APP_NAME, BMC_URL } from "@/lib/config";
import { useFinance } from "@/lib/finance";

export default function SupportPage() {
  const { ds } = useFinance();
  const months = Math.max(1, new Set(ds.transactions.map((t) => t.date.slice(0, 7))).size);
  const share = async () => {
    const data = { title: APP_NAME, text: "I use Kosh to see where my money is heading — try it:", url: window.location.origin };
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
    <div className="mx-auto max-w-2xl">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-10">
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ffdd00] text-[#0d0c22]">
          <Coffee className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="display text-[32px] font-semibold leading-tight sm:text-[40px]">Keep {APP_NAME} brewing</h1>
        <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-ink-2">
          {APP_NAME} is free, has no ads and never sells your data. It&apos;s built and maintained by an independent developer. If it&apos;s helped you plan your money
          {ds.transactions.length > 20 ? ` — you've tracked ${ds.transactions.length.toLocaleString("en-IN")} transactions over ${months} months` : ""}, a coffee goes a long way.
        </p>
        {BMC_URL ? (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <BmcButton size="lg" />
            <span className="text-[13px] text-ink-3">Opens Buy Me a Coffee in a new tab. One-off or monthly — your choice.</span>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-line-strong p-4 text-[14px] text-ink-2">
            <p className="font-semibold text-ink">Buy Me a Coffee isn&apos;t connected yet.</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Create a free page at buymeacoffee.com.</li>
                <li>
                  Put your username in <code className="rounded bg-surface-3 px-1">.env.local</code> as <code className="rounded bg-surface-3 px-1">NEXT_PUBLIC_BMC_USERNAME=yourname</code>.
                </li>
                <li>Optionally set <code className="rounded bg-surface-3 px-1">NEXT_PUBLIC_BMC_WIDGET=true</code> for a floating Support button on desktop.</li>
                <li>Restart the app (or redeploy).</li>
              </ol>
          </div>
        )}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Panel title="Other ways to help">
          <div className="flex flex-col gap-2">
            <Button icon={<Share2 className="h-4 w-4" />} onClick={share}>
              Share {APP_NAME} with a friend
            </Button>
            <p className="text-[12.5px] text-ink-3">Word of mouth is the best support there is.</p>
          </div>
        </Panel>
        <Panel title="What your support pays for">
          <ul className="space-y-1.5 text-[13.5px] text-ink-2">
            <li className="flex gap-2">
              <Heart className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden /> Hosting and database costs as more people use it
            </li>
            <li className="flex gap-2">
              <Heart className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden /> New modules: tax centre, statement parsing, insurance
            </li>
            <li className="flex gap-2">
              <Heart className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden /> Time to fix bugs quickly
            </li>
          </ul>
        </Panel>
      </div>
      <p className="mt-6 text-center text-[12.5px] text-ink-3">Nothing about your finances is ever shared with Buy Me a Coffee.</p>
    </div>
  );
}
