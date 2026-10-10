# Nudge Chapters

**Small nudges. Bigger chapters.** A personal command centre for your money.

**Live:** https://nudgechapters.in

Nudge Chapters is an all-in-one personal financial operating system built from the
**All-in-One Personal Finance App PRD**. It combines cash flow, bills, bank balances,
credit cards, EMIs, investments, EPFO, chits, lending and goals, and answers the PRD's
central question:

> "If I continue with my current income, commitments, investments, debts and planned
> expenses, how much money and net worth will I have on any future date?"

- **Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth) · Recharts
- **Responsive:** mobile-first. Bottom navigation on phones, sidebar on desktop, and installable as an app (PWA).
- **Free database:** Supabase free tier, with row-level security so every user only sees their own rows.
- **Works without setup:** a device-only demo mode with realistic sample data.
- **Buy Me a Coffee:** a support page, sidebar link and optional floating button.

---

## Quick start

```bash
cd ~/Projects/nudge-chapters
cp .env.example .env.local   # already contains your Supabase project's URL and public key
npm install
npm run dev                  # http://localhost:3000
```

On the sign-in screen you can:

- **Create an account**, which stores your data in Supabase and syncs it between phone and laptop.
- **Explore with sample data**, which uses a realistic demo profile stored in this browser only.
- **Use without an account**, which starts empty and stores data in this browser only.

```bash
npm test             # 22 unit tests for the financial engine and business rules
npm run typecheck
npm run build && npm start
```

Requires Node.js 20.9 or newer.

---

## Supabase (already created for you)

| | |
|---|---|
| Project | `nudge-chapters` (ref `mzmcvnqmdyvlzzppzfyo`) |
| Region / plan | Mumbai (`ap-south-1`) · Free |
| URL | `https://mzmcvnqmdyvlzzppzfyo.supabase.co` |
| Config | `.env.example` → copy to `.env.local` (the URL and public key are already filled in) |

The tables, indexes, row-level security policies and the sign-up trigger are **already
applied**. Two one-time steps are left for you:

1. **Run `supabase/finish-setup.sql`.** In Supabase, open *SQL Editor → New query*, paste
   the file and click *Run*. It adds the "delete your own rows" policies, the audit-log
   trigger, and the *Delete my account* function. The connector couldn't apply these
   because they contain `delete` statements that need your confirmation. Until you run it,
   everything works except deleting records.
2. **Set the auth redirect URLs.** In *Authentication → URL Configuration*, set *Site URL*
   to where the app runs (e.g. `http://localhost:3000`, later your production URL) and add
   it under *Redirect URLs*. Email confirmation links, magic links and password resets use
   these URLs.

Optional:

- **Google sign-in:** enable the Google provider in *Authentication → Providers*, then set
  `NEXT_PUBLIC_AUTH_GOOGLE=true`.
- **Two-step verification (TOTP):** works out of the box. Users turn it on in
  *Settings → Security*.
- **A fresh project:** run `supabase/migrations/0001_init.sql` once. It contains the
  complete schema.

> The free tier pauses a project after a week with no activity. Opening the app, or
> clicking *Restore* in the dashboard, wakes it up.

---

## Buy Me a Coffee

1. Create a free page at [buymeacoffee.com](https://buymeacoffee.com).
2. In `.env.local`, set:

   ```
   NEXT_PUBLIC_BMC_USERNAME=yourname     # the part after buymeacoffee.com/
   NEXT_PUBLIC_BMC_WIDGET=true           # optional floating "Support" button on desktop
   ```
3. Restart `npm run dev` (or redeploy).

That turns on:

- a **Support** page at `/support`,
- a **Support Nudge Chapters** link in the sidebar and the mobile *More* screen,
- a card in *Settings → Appearance*,
- the optional floating button on desktop.

While no username is set, these stay hidden, except `/support`, which shows the setup
steps. All of it uses a plain link to your page, so there are no third-party scripts and
no data is shared with Buy Me a Coffee.

---

## Deploy for free

**Vercel (recommended):**

1. Push this folder to GitHub, then *Import* it at vercel.com.
2. Add the variables from `.env.local` in *Settings → Environment Variables*.
3. Deploy.
4. Add the deployment URL to Supabase *Authentication → URL Configuration*.

Netlify also supports Next.js out of the box. Every route is pre-rendered, and all data
access happens in the browser through Supabase with row-level security. To host on a
purely static service (GitHub Pages, S3), add `output: "export"` to `next.config.ts`; the
security headers there then have to be set by the host.

---

## What's in the app (mapped to the PRD)

| Area | Highlights | PRD |
|---|---|---|
| **Dashboard** | Safe-to-spend this month (tap to see the calculation), net worth with change since last month, runway, income, committed, unpaid bills, investments, liabilities, money owed to you. A projection ribbon lets you drag to any date up to 10 years ahead. Also: upcoming bills and income, alerts, cash-flow and net-worth charts, a next-90-days timeline with running cash, budgets, goals and investments. Widgets can be hidden or reordered, with separate layouts for phone and desktop. | §3, §40, App. B |
| **Cash flow** | Monthly planned-vs-actual, transactions (search and filters), bills (overdue, upcoming, recently paid), recurring income, bills, budgets and transfers, reserves/envelopes, subscriptions (yearly cost, pause, duplicate hints) | §5, §19, §39.2, §39.4 |
| **Assets** | Bank and cash accounts with *match bank balance* reconciliation; mutual funds, stocks, ETFs, FDs, gold and crypto with gain, XIRR, allocation, concentration, domestic vs international and bulk price updates; EPF, PPF and NPS with passbook history and value at retirement; money lent; property and vehicles | §6, §10–§14, §39.13–15, §39.27 |
| **Liabilities** | Credit cards (statements, billed vs unbilled, utilisation, pay, convert to EMI); loans and EMIs (amortisation schedule, prepayment simulator); chits (installments, payout, net gain or cost, asset vs liability); money borrowed; debt planner (minimum vs snowball vs avalanche, invest-or-prepay) | §7–§9, §39.10–11 |
| **Goals** | Progress, required monthly amount, projected date, on/off-track, per-goal what-if, conflict detection, emergency fund (3/6/9/12 months, runway), retirement planner (readiness score, gap), financial independence (FI number, coast FI) | §15, §39.3, §39.7–39.9 |
| **Future** | Projection to any date with conservative, base, optimistic and custom scenarios, an inflation-adjusted view, a line-by-line cash breakdown, assumptions shown, end-state accounts, investments and liabilities, and an event timeline. Also scenario comparison, a stackable what-if simulator (salary change, job loss, new EMI, extra SIP, big purchase, bonus), an affordability check (cash, EMI or card) with a safer-date suggestion, and an assumptions editor | §17, §32, §39.20–21, §41 |
| **Calendar** | Month, agenda and year views with status colours and labels; filter by type or account; tap to pay, move or skip | §39.1 |
| **Reports** | Income vs expenses, savings and investment rates, category breakdown, fixed vs variable, top payees, net-worth history (inflation-adjusted option, drivers of change), investment performance, EMI burden, credit utilisation, annual review with recommendations, financial health score (8 parts, each explained), print to PDF | §18, §21, §39.18–19, §39.23 |
| **Settings** | Profile, currency and number format, FX rates, categories (fixed/essential), alert preferences, browser notifications with quiet hours and digest, CSV/Excel import (column mapping, preview, duplicate detection), JSON backup and restore, Excel and CSV export, delete all data, password, TOTP two-step, sign out everywhere, delete account, activity log, theme, Simple/Advanced mode | §23–§27, §43–§47, §54 |
| **Everywhere** | Quick-add button, `Ctrl/⌘ K` search and natural-language questions ("how much will I have by Dec 2027?", "can I afford 2L"), `N` for a new transaction, hide-amounts toggle, light and dark themes, guided onboarding | §24, §25, §39.29, §44 |

### The financial engine (`src/lib/engine`)

- **`ledger.ts`** computes balances and positions from actual transactions.
- **`events.ts`** turns recurring rules, SIPs, EMIs, chits, card cycles and lendings into
  dated events and reconciles them against actual transactions. Each event follows the
  PRD §42 state machine: planned → due → overdue → paid/received/partial/skipped/cancelled/adjusted.
- **`projection.ts`** is a day-by-day simulator. It grows investments at the scenario's
  returns, applies what-ifs, and reports month-end snapshots, the lowest cash point,
  negative-balance dates and a cash breakdown that reconciles to the rupee.
- **`loans.ts`** handles EMIs (reducing and flat rate), amortisation, prepayments and
  snowball/avalanche planning.
- **`goals.ts`**, **`metrics.ts`**, **`alerts.ts`** and **`reports.ts`** handle goals,
  retirement and FIRE, dashboard numbers, alerts, reports and the health score.

The PRD §31 business rules are enforced in the engine and covered by tests
(`engine.test.ts`):

- Transfers between your own accounts are never income or expense.
- A card purchase is the expense; paying the card bill only settles the liability.
- Lending moves cash into a receivable; repayments move it back.
- Investment purchases are not consumption.
- A settled planned event is never counted again.
- Editing a rule doesn't change historical actuals.
- Projections always show their assumptions and are styled as estimates (violet, dotted underline).

### Data model (`supabase/migrations/0001_init.sql`)

The schema has 17 tables:

- `profiles`
- `accounts`
- `categories`
- `credit_cards`
- `card_statements`
- `loans`
- `chits`
- `goals`
- `investments`
- `investment_valuations`
- `lendings`
- `reserves`
- `recurring_rules`
- `event_overrides`
- `transactions`
- `net_worth_snapshots`
- `audit_events`

Every user table has `user_id default auth.uid()` and select, insert, update and delete
policies of the form `(select auth.uid()) = user_id`. Changes are audited by trigger.

---

## Not built yet (PRD Phase 3 and future)

These are designed for in the schema and engine but not implemented:

- Email and push reminders sent from a server (needs a Supabase Edge Function and a cron job)
- Bank and broker aggregation, live market prices, CAS and statement PDF parsing, email parsing
- Tax centre, insurance and policy vault, document storage, family/shared finances, expense splitting
- AI assistant (the command palette already answers common questions)

## Project layout

```
src/app/(auth)        sign-in, password reset
src/app/(setup)       onboarding
src/app/(app)         dashboard, cash-flow, assets, liabilities, goals, projection, calendar, reports, settings, more, support
src/components        UI kit, forms/editors, charts, sheets, shell (nav, alerts, command palette)
src/lib/engine        the financial engine (pure TypeScript, unit-tested)
src/lib/data          Supabase and local repositories, demo data, import/export
supabase/             migrations and finish-setup.sql
```


## Deployment (GitHub Pages, free)

Every push to `main` runs `.github/workflows/deploy.yml`: typecheck → tests → static export (`npm run build:static`, base path `/<repo>`) → published to the `gh-pages` branch. Pull requests run the same checks without deploying.

One-time setup:
1. Repo **Settings → Pages → Source: Deploy from a branch → `gh-pages` / root** (if not enabled automatically).
2. **Supabase → Authentication → URL Configuration:** Site URL `https://nudgechapters.in`, and add it to Redirect URLs (needed for magic links, sign-up confirmation and password reset).
3. Optional: run `supabase/finish-setup.sql` in the Supabase SQL editor (audit trail + "Delete my account").

Domain: `nudgechapters.com` availability couldn't be verified from here — check a registrar; if you buy it, add it under Settings → Pages → Custom domain and set `NEXT_PUBLIC_BASE_PATH` to empty in the workflow.

## Environment variables

See `.env.example`. Development: `.env.local`. Production: GitHub repository variables (defaults in the workflow are the public Supabase URL/publishable key). All are `NEXT_PUBLIC_*` and public by design — never add a service_role key.

## Chits: auction-dependent installments

Each installment keeps its own record (base, auction date, discount, dividend, fees, payable, paid, source). Actual, confirmed and projected (TBD) amounts are kept apart; "Current actual net" uses only actual payments, and pending auctions show as a projected range. Stored as `chits.installment_records` (jsonb, migration 0002).

## Known limitations

- GitHub Pages can't send security headers (they apply when self-hosting with `npm start`).
- Supabase project is still named "kosh-finance" in the dashboard (rename under Project Settings → General; nothing depends on it).
- Audit trail / account deletion need `finish-setup.sql` (one-time, manual).
- Offline: the app shell opens offline; financial data is never cached by the service worker.

## Personal system (Phase 2)

- **Today** (`/`): money at a glance, your chapters, explained nudges, tasks, and one thing to consider.
- **Chapters** (`/goals`): each savings goal with its linked tasks, checklists, notes and wishlist.
- **Plan** (`/plan`): tasks (repeating, steps, priority), checklists, notes (pin, archive, tags, links), reminders, wishlist with a buy / wait / save-first check.
- **Nudges** (`src/lib/engine/life.ts`): bills, chapter steps, spending above your usual pace, due tasks, wishlist at target price, safety net — each with reason, source, impact and an estimate label.
- **Search / command centre** (Ctrl+K): searches everything; understands "how much did I spend on food last month", "create an Ooty chapter", "add SSD to wishlist", "remind me to…", "add task …", "what should I focus on".
- Stored in `life_items` (migration 0004).

## Remaining work (next phase)

Bank/email/EPFO integrations, live market & price data, AI assistant (needs a server-side API key), image uploads (Supabase Storage), push notifications, native app wrappers, custom domain.
