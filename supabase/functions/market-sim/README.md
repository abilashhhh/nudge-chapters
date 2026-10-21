# Market Simulator (Paper Trading)

Paper trading against real market prices. **No real orders, no real money.** App: Trading → Paper Trading (`/trading/paper`).

## Pieces

| Piece | Where |
|---|---|
| Rules (charges, slippage, fill price, market hours, order checks, position maths) | `supabase/functions/market-sim/core.ts` — shared by the server and the app (`src/lib/sim/core.ts` re-exports it); tests in `src/lib/sim/core.test.ts` |
| Market data + order execution | Edge Function `market-sim` (`index.ts`) |
| Tables + atomic fill | `supabase/migrations/0024_market_sim.sql` (`sim_accounts`, `sim_watchlist`, `sim_orders`, `sim_fills`, `sim_positions`, `sim_snapshots`, `sim_quote_cache`; functions `sim_fill`, `sim_reset`) |
| Analytics | `src/lib/sim/analytics.ts` (+ tests) — only from saved fills and snapshots |
| Screens | `src/components/sim/*` |

## Market data

Provider: Yahoo Finance's public chart and search endpoints (NSE `XYZ.NS`, BSE `XYZ.BO`, indices `^NSEI`, `^BSESN`, `^NSEBANK`, `^CNXIT`). It is a free, unofficial feed: it can be delayed, rate-limited or changed without notice, and its terms restrict redistribution — fine for a private practice tool, not for publishing prices. A licensed real-time NSE feed needs a paid vendor; swap `providerQuote` / `providerChart` / `providerSearch` in `index.ts` to change provider.

- Quotes are cached in `sim_quote_cache` (15 s while the market is open, 10 min when closed); charts 30 s – 1 h by timeframe; searches 1 day. If the provider fails, the last cached copy is served marked `stale`.
- Each quote carries the provider's own timestamp. The app says **Live** only when the market is open and the quote is under a minute old; otherwise **Delayed N min**, **Market closed · last …** or **Couldn't refresh**.
- Market status comes from the exchange session in the data (so holidays show as closed), else the NSE timetable (pre-open 09:00–09:15, open 09:15–15:30 IST, Mon–Fri).
- Candles with missing values are left out; nothing is invented.

## Execution rules (deterministic)

- The server always fetches the price itself (≤ 10 s old) — the app never sends one.
- **Market orders**: only while the market is open; fill at the quote ± slippage (default 0.05%), rounded to 5 paise.
- **Limit orders**: fill at once if the quote has reached the limit, else stay pending. Pending limits are checked against the **latest quote** each time the simulator refreshes (every 30 s while open on screen, or on next visit). The price used is the quote if better than the limit, never worse. Because only periodic quotes are seen, a price touched briefly between checks does **not** fill the order — that's deliberate (no fill without evidence). Pending orders expire after 7 days.
- **Intraday**: only while open and before the square-off time (default 15:20 IST). Positions are sold at the market price at/after square-off (on the next refresh), and unfilled intraday orders are cancelled. No leverage — full value is needed.
- **Delivery**: held until sold.
- No partial fills; no short selling.
- Checks before accepting: whole quantity, limit within 20% of market, enough cash for value + charges, enough free shares in the same product (pending sells reserve shares), max order value, max stocks held, daily loss limit. A rejected order is saved with its reason and changes nothing else.
- `sim_fill` locks the order and the account rows and changes cash, position, realized P&L and the fill record in one transaction. An order fills at most once (status check + unique `order_id` on fills); each order carries a client id so a retried request returns the first order.

## Money maths

- Average cost: `(avg × held + price × qty) ÷ (held + qty)`; unchanged by sales.
- Buy charges are kept on the position and set against sales pro-rata.
- Realized on a sale: `(price − avg) × qty − sell charges − share of buy charges`.
- Unrealized: `(price now − avg) × qty − remaining buy charges`. So realized + unrealized = account value − starting capital.
- Default charges (estimates, rates from 2024-10-01, editable): brokerage 0 delivery / 0.03% capped ₹20 intraday; STT 0.1% delivery both sides / 0.025% intraday sell; NSE 0.00297%; SEBI 0.0001%; GST 18% on brokerage + fees; stamp 0.015% delivery / 0.003% intraday buy.

## Reset

`sim_reset` archives the active account (cancelling its open orders) and opens a new one. Archived accounts stay for history; nothing outside the `sim_*` tables is touched.
