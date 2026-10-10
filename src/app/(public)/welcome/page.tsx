import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { APP_NAME, SITE_URL } from "@/lib/config";

const TITLE = "Nudge Chapters — Free money tracker for EMIs, credit cards, chits & budgets";
const DESCRIPTION =
  "Track bank balances, credit card bills, EMIs, chit funds, EPF, SIPs, budgets and money you've lent — all on one timeline. See what's safe to spend this month and what you'll have on any future date. Free, no ads, no bank login.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/welcome/" },
  openGraph: { url: "/welcome/", title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};

const FEATURES: { title: string; body: string }[] = [
  { title: "Safe to spend, every month", body: "One number that already takes out this month's bills, EMIs, card payments, budgets and savings — so you know what you can actually spend." },
  { title: "Credit card bills that don't surprise you", body: "Statement and due dates for every card, what's billed, what's unbilled, and a reminder before each payment is due." },
  { title: "EMIs and loans", body: "Every EMI on one calendar, with what's left on each loan and when it ends — including card EMIs and loans you pay for someone else." },
  { title: "Chit funds", body: "Installments, auction dividends and your expected payout, tracked month by month." },
  { title: "Investments, SIPs and EPF", body: "Mutual funds, stocks, FDs, PPF and EPF in one place, with SIPs that show up on the day they're due." },
  { title: "Money you've lent or borrowed", body: "Who owes you, who you owe, and when it's due — split bills, family loans and reimbursements included." },
  { title: "Budgets that reset themselves", body: "Set ₹5,000 for groceries or ₹2,000 for fuel once; every month starts fresh and shows what's left." },
  { title: "Your future, on any date", body: "Ask how much you'll have by March 2028. Income, bills, EMIs, SIPs and goals are all projected forward." },
  { title: "Goals as chapters", body: "A trip, a bike, an emergency fund — see how much to set aside each week to get there on time." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Is Nudge Chapters free?", a: "Yes. It's free to use, with no ads. If it helps you, you can support the developer with a coffee." },
  { q: "Do I need to link my bank account?", a: "No. You add your own accounts, cards and bills, so no bank login or SMS access is needed. You can also import transactions from a CSV or Excel file." },
  { q: "Can it track credit card bills and EMIs in India?", a: "Yes. It's built around how money works in India: credit card statement and due dates, EMIs (including no-cost and card EMIs), chit funds, EPF, PPF, SIPs and amounts in rupees with lakh-style formatting." },
  { q: "How does it work out what's safe to spend?", a: "It starts from the cash in your accounts, adds income still expected this month, and takes out bills, EMIs, card payments, remaining budgets and money you've set aside. What's left is safe to spend." },
  { q: "Can I try it without signing up?", a: "Yes. Open the demo with sample data, or start with an empty setup that stays only on your device." },
  { q: "Does it work on my phone?", a: "Yes. It runs in any browser and can be installed to your home screen like an app, with an optional Face ID or fingerprint lock." },
];

export default function WelcomePage() {
  const url = SITE_URL ? `${SITE_URL}/welcome/` : undefined;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: APP_NAME,
      url,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript",
      description: DESCRIPTION,
      inLanguage: "en-IN",
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      featureList: FEATURES.map((f) => f.title),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/welcome/" aria-label={`${APP_NAME} home`}>
          <Brand size="md" />
        </Link>
        <nav className="flex items-center gap-2 text-[14px]">
          <Link href="/login/" className="hidden rounded-xl px-3 py-2 font-medium text-ink-2 hover:text-ink sm:inline-block">
            Sign in
          </Link>
          <Link href="/login/" className="whitespace-nowrap rounded-xl bg-brand px-4 py-2 font-semibold text-on-brand">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 pb-14 pt-10 sm:px-6 sm:pt-16">
          <p className="text-[13px] font-medium uppercase tracking-wide text-brand">Personal finance tracker · Made for India</p>
          <h1 className="display mt-3 max-w-3xl text-[36px] font-semibold leading-[1.08] sm:text-[52px]">
            All your money in one place — bills, cards, EMIs, chits and investments.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">
            Nudge Chapters puts your bank balances, credit card bills, EMIs, chit funds, SIPs, EPF and the money you&apos;ve lent on one timeline.
            See what&apos;s safe to spend this month, what&apos;s due next month, and what you&apos;ll have on any date in the future.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/login/" className="rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-on-brand">
              Start free
            </Link>
            <Link href="/login/" className="rounded-xl border border-line-strong bg-surface px-5 py-3 text-[15px] font-semibold">
              Try the demo
            </Link>
          </div>
          <p className="mt-3 text-[13px] text-ink-3">Free · No ads · No bank login needed</p>
        </section>

        <section aria-labelledby="features" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 id="features" className="display text-[26px] font-semibold sm:text-[32px]">
              Everything you track, on one screen
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title}>
                  <h3 className="text-[16px] font-semibold">{f.title}</h3>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="how" className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 id="how" className="display text-[26px] font-semibold sm:text-[32px]">
            How it works
          </h2>
          <ol className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              ["Add what you have and owe", "Bank accounts, cards, loans, chits, investments and IOUs — or import a CSV or Excel file."],
              ["Add what repeats", "Salary, rent, bills, SIPs and budgets. EMIs and card bills are worked out for you."],
              ["Follow the nudges", "Each month shows what's due, what's safe to spend, and the one thing worth doing next."],
            ].map(([t, b], i) => (
              <li key={t} className="rounded-2xl border border-line bg-surface p-5">
                <span className="num text-[13px] font-semibold text-brand">Step {i + 1}</span>
                <h3 className="mt-1 text-[16px] font-semibold">{t}</h3>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{b}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="faq" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
            <h2 id="faq" className="display text-[26px] font-semibold sm:text-[32px]">
              Questions
            </h2>
            <div className="mt-6 divide-y divide-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="cursor-pointer list-none text-[16px] font-semibold marker:hidden">
                    {f.q}
                  </summary>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-6">
          <h2 className="display text-[26px] font-semibold sm:text-[32px]">Small nudges. Bigger chapters.</h2>
          <p className="mx-auto mt-3 max-w-xl text-[15.5px] text-ink-2">Know where your money is today, and where it&apos;s heading.</p>
          <Link href="/login/" className="mt-6 inline-block rounded-xl bg-brand px-6 py-3 text-[15px] font-semibold text-on-brand">
            Start free
          </Link>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[13px] text-ink-3 sm:px-6">
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
          <Link href="/login/" className="hover:text-ink">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
