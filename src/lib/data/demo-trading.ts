// Sample trade journal and IPO applications for the demo.
import { addDays, parseISO } from "../dates";
import type { IpoApplication, Trade } from "../types";

const STOCKS: [string, string, number][] = [
  ["RELIANCE", "Reliance Industries", 2_890],
  ["TATAMOTORS", "Tata Motors", 940],
  ["INFY", "Infosys", 1_860],
  ["HDFCBANK", "HDFC Bank", 1_640],
  ["SBIN", "State Bank of India", 810],
  ["ITC", "ITC", 470],
  ["ADANIENT", "Adani Enterprises", 3_050],
  ["ZOMATO", "Zomato", 245],
];

export function demoTrading(id: () => string, rand: () => number, today: string): { trades: Trade[]; ipo_applications: IpoApplication[] } {
  const trades: Trade[] = [];
  const round = (n: number) => Math.round(n * 20) / 20;
  // About two intraday trades on most market days of the last three months.
  for (let d = 1; d <= 90; d++) {
    const day = addDays(today, -d);
    const wd = parseISO(day).getUTCDay();
    if (wd === 0 || wd === 6 || rand() < 0.35) continue;
    const n = 1 + Math.floor(rand() * 2.4);
    for (let k = 0; k < n; k++) {
      const [symbol, name, base] = STOCKS[Math.floor(rand() * STOCKS.length)];
      const entry = round(base * (0.96 + rand() * 0.08));
      const move = (rand() - 0.45) * 0.022; // a slight edge, with real losing days
      const short = rand() < 0.25;
      const exit = round(entry * (1 + (short ? -move : move)));
      const qty = Math.max(1, Math.round(25_000 / entry / (1 + Math.floor(rand() * 3))));
      trades.push({
        id: id(), symbol, name, exchange: "NSE", segment: "intraday", side: short ? "short" : "long", quantity: qty,
        entry_date: day, entry_price: entry, exit_date: day, exit_price: exit, charges: Math.round((entry * qty * 0.0006 + 20) * 100) / 100,
        broker: "Zerodha", strategy: rand() < 0.5 ? "Opening range breakout" : "VWAP pullback", notes: null, tags: [],
      });
    }
  }
  // A few swing and delivery trades, two still open.
  const swing = (symbol: string, name: string, seg: Trade["segment"], qty: number, inD: number, inP: number, outD: number | null, outP: number | null): Trade => ({
    id: id(), symbol, name, exchange: "NSE", segment: seg, side: "long", quantity: qty, entry_date: addDays(today, -inD), entry_price: inP,
    exit_date: outD == null ? null : addDays(today, -outD), exit_price: outP, charges: seg === "delivery" ? 32 : 40, broker: "Zerodha", strategy: "Breakout", notes: null, tags: [],
  });
  trades.push(
    swing("TATAMOTORS", "Tata Motors", "swing", 30, 70, 905, 58, 962),
    swing("INFY", "Infosys", "swing", 12, 52, 1_905, 40, 1_842),
    swing("SBIN", "State Bank of India", "swing", 40, 31, 788, 19, 829),
    swing("ITC", "ITC", "delivery", 60, 400, 412, 20, 468),
    swing("HDFCBANK", "HDFC Bank", "swing", 15, 9, 1_618, null, null),
    swing("ZOMATO", "Zomato", "delivery", 100, 25, 231, null, null),
  );
  const ipo = (p: Partial<IpoApplication> & Pick<IpoApplication, "name" | "price" | "lot_size">, applied: number): IpoApplication => ({
    id: id(), symbol: null, category: "retail", apply_date: addDays(today, -applied), lots: 1, status: "applied", allotted_shares: 0,
    listing_date: null, listing_price: null, sold_date: null, sold_price: null, account_id: null, broker: "Zerodha", notes: null, ...p,
  });
  const ipo_applications = [
    ipo({ name: "Bajaj Housing Finance", symbol: "BAJAJHFL", price: 70, lot_size: 214, status: "sold", allotted_shares: 214, listing_date: addDays(today, -80), listing_price: 150, sold_date: addDays(today, -80), sold_price: 148.5 }, 86),
    ipo({ name: "Hyundai Motor India", symbol: "HYUNDAI", price: 1_960, lot_size: 7, status: "not_allotted" }, 60),
    ipo({ name: "Swiggy", symbol: "SWIGGY", price: 390, lot_size: 38, status: "listed", allotted_shares: 38, listing_date: addDays(today, -33), listing_price: 420 }, 40),
    ipo({ name: "NTPC Green Energy", symbol: "NTPCGREEN", price: 108, lot_size: 138, lots: 2, status: "not_allotted" }, 25),
    ipo({ name: "Vishal Mega Mart", symbol: "VMM", price: 78, lot_size: 190, status: "applied" }, 2),
  ];
  return { trades, ipo_applications };
}
