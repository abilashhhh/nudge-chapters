// Reads an Indian bank / card SMS into the facts we need: amount, money in or out, which account or card (last
// digits), who it was paid to or from, the reference number, the date and the balance or limit left.
//
// Banks word these in many ways, so this looks for patterns rather than exact templates. Anything it isn't sure
// about is left empty and the message waits in the inbox for you to confirm.

import type { ISODate } from "../types";

export type SmsDirection = "debit" | "credit";
export type SmsInstrument = "card" | "account" | "wallet" | null;

export interface ParsedSms {
  amount: number | null;
  direction: SmsDirection | null;
  instrument: SmsInstrument;
  /** Last 3–6 digits of the account or card the message is about. */
  last4: string | null;
  bank: string | null;
  merchant: string | null;
  /** UPI / IMPS / NEFT reference, used to spot the same payment reported twice. */
  ref: string | null;
  date: ISODate | null;
  /** Balance left in the account, when the message says it. */
  balance: number | null;
  /** Credit limit left on the card, when the message says it. */
  availableLimit: number | null;
  /** A payment towards a credit card bill (as the card reports it). */
  cardPayment: boolean;
  /** Not a transaction at all (OTP, offer, reminder, failed or declined payment). */
  ignore: string | null;
  /** 0–1: how sure we are about amount, direction and where. */
  confidence: number;
}

const NUM = String.raw`(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?`;
const CUR = String.raw`(?:rs\.?|inr|₹)`;

function num(s: string | undefined | null): number | null {
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const BANKS: [RegExp, string][] = [
  [/\bhdfc/i, "HDFC Bank"],
  [/\bicici/i, "ICICI Bank"],
  [/\baxis/i, "Axis Bank"],
  [/\bsbi\b|state bank|sbicrd|sbiinb|sbmsms|cbssbi/i, "State Bank of India"],
  [/\bkotak/i, "Kotak Bank"],
  [/\bidfc/i, "IDFC First Bank"],
  [/\byes ?bank|\byesbnk/i, "YES Bank"],
  [/\bbob\b|bank of baroda|onecard/i, "Bank of Baroda / OneCard"],
  [/\bcanara|\bcanbnk/i, "Canara Bank"],
  [/dhanlaxmi|dhanalaxmi|\bdhanbk/i, "Dhanalaxmi Bank"],
  [/\bpnb\b|punjab national/i, "Punjab National Bank"],
  [/\bunion bank|\bubi\b/i, "Union Bank"],
  [/\bfederal/i, "Federal Bank"],
  [/\bindusind/i, "IndusInd Bank"],
  [/\bslice/i, "Slice"],
  [/\bamex|american express/i, "American Express"],
  [/\bau ?bank|\bau small/i, "AU Bank"],
  [/\bpaytm/i, "Paytm"],
];

/** Bank SMS dates: 16-10-26, 16/10/2026, 16Oct26, 16-Oct-26, 2026-10-15, 16 Oct 2026. */
function parseDate(text: string, fallbackYear: number): ISODate | null {
  const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const y4 = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
  let m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = text.match(/\b(\d{1,2})[-/ ]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/ ,]*(\d{2,4})\b/i);
  if (m) return iso(y4(m[3]), MON[m[2].toLowerCase()], Number(m[1]));
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) return iso(y4(m[3]), Number(m[2]), Number(m[1]));
  m = text.match(/\b(\d{1,2})[- ](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (m) return iso(fallbackYear, MON[m[2].toLowerCase()], Number(m[1]));
  return null;
}

function clean(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/[.,;:\-]+$/, "")
    .trim();
}

/** Who the money went to or came from. */
function merchantOf(text: string): string | null {
  const pats = [
    /\b(?:at|@)\s+([A-Za-z0-9][A-Za-z0-9 &'._*\-/]{1,40}?)(?=\s+(?:on|via|ref|avl|avbl|bal|txn|upi|using|for|is|was|\d{1,2}[-/])\b|[.,]|$)/i,
    /\bVPA\s+([A-Za-z0-9._\-]+@[A-Za-z0-9.\-]+)/i,
    /\b(?:to|trf to|transfer to|paid to|towards)\s+(?:VPA\s+)?([A-Za-z0-9][A-Za-z0-9 &'._@\-/]{1,40}?)(?=\s+(?:on|via|ref|refno|upi|avl|avbl|bal|from|for|is|was|\(|\d{1,2}[-/]|not\b)|[.,(]|$)/i,
    /\b(?:from|by)\s+(?:VPA\s+)?([A-Za-z0-9][A-Za-z0-9 &'._@\-/]{1,40}?)(?=\s+(?:on|via|ref|refno|upi|avl|avbl|bal|is|was|\(|\d{1,2}[-/])|[.,(]|$)/i,
  ];
  for (const p of pats) for (const m of text.matchAll(new RegExp(p.source, "gi"))) {
    let v = clean(m[1]).replace(/^(?:neft|imps|rtgs|upi)\s+(?:from|by)\s+/i, "");
    // Not a merchant: an account / card mention, a bank name, or a date.
    if (/^(a\/?c|ac|acct|account|card|your|xx|\*|ending|bank|upi|imps|neft|rtgs|the)\b/i.test(v) || /^\d+$/.test(v) || v.length < 2) continue;
    // A UPI id: keep the readable part (swiggy@icici → swiggy).
    if (/@/.test(v)) v = v.split("@")[0].replace(/[._-]+/g, " ");
    v = v.replace(/\b(?:ltd|pvt|private|limited|india)\b\.?/gi, "").trim();
    if (!v) continue;
    return v.length > 32 ? v.slice(0, 32).trim() : v;
  }
  return null;
}

export function parseSms(body: string, sender?: string | null, today: ISODate = new Date().toISOString().slice(0, 10)): ParsedSms {
  const text = body.replace(/\s+/g, " ").trim();
  const low = text.toLowerCase();
  const out: ParsedSms = { amount: null, direction: null, instrument: null, last4: null, bank: null, merchant: null, ref: null, date: null, balance: null, availableLimit: null, cardPayment: false, ignore: null, confidence: 0 };

  if (/\botp\b|one[ -]time password|verification code/.test(low)) out.ignore = "OTP";
  else if (/\b(declined|failed|unsuccessful|could not be processed|reversed? (?:of|for)?\s*failed)\b/.test(low) && !/refund|reversal of/.test(low)) out.ignore = "Failed or declined";
  else if (/\b(will be debited|is due|due on|due date|payment due|min(?:imum)? (?:amount )?due|total (?:amount )?due|statement (?:for|of)|bill (?:is )?generated|e-?mandate|auto ?pay .*scheduled|requested money|collect request)\b/.test(low) && !/\b(debited|credited|spent|received)\b(?! by)/.test(low.replace(/will be debited/g, "")))
    out.ignore = "Reminder, not a payment";
  else if (/\b(offer|cashback up to|win|apply now|pre-?approved|loan of up to|limit increase)\b/.test(low) && !/\b(debited|credited|spent)\b/.test(low)) out.ignore = "Offer";

  // Bank
  const hay = `${sender ?? ""} ${text}`;
  out.bank = BANKS.find(([re]) => re.test(hay))?.[1] ?? null;

  // Amount: the first money figure that isn't the balance or limit.
  const stripped = text.replace(new RegExp(String.raw`(?:avl|avbl|available|aval)\.?\s*(?:bal(?:ance)?|lmt|limit|cr(?:edit)? ?lim(?:it)?)\.?\s*(?:is|:)?\s*(?:${CUR})?\s*-?${NUM}`, "gi"), " ").replace(new RegExp(String.raw`\bbal(?:ance)?\.?\s*(?:is|:)?\s*${CUR}\s*-?${NUM}`, "gi"), " ");
  const amt = stripped.match(new RegExp(String.raw`${CUR}\s*(${NUM})`, "i")) ?? stripped.match(new RegExp(String.raw`(?:debited|credited|spent|paid|sent|received|withdrawn|deposited)\s+(?:by|with|for|of)?\s*(?:${CUR})?\s*(${NUM})`, "i"));
  out.amount = num(amt?.[1]);

  // Balance / limit
  const bal = text.match(new RegExp(String.raw`(?:avl|avbl|available|aval|clear|closing)?\.?\s*bal(?:ance)?\.?\s*(?:is|:|-)?\s*(?:${CUR})\s*(-?${NUM})`, "i"));
  if (bal) out.balance = num(bal[1]);
  const lim = text.match(new RegExp(String.raw`(?:avl|avbl|available|aval)\.?\s*(?:lmt|limit|cr(?:edit)? ?lim(?:it)?)\.?\s*(?:is|:)?\s*(?:${CUR})?\s*(${NUM})`, "i"));
  if (lim) {
    out.availableLimit = num(lim[1]);
    if (out.balance === out.availableLimit) out.balance = null;
  }

  // Card, account or wallet, and its last digits
  const card = text.match(/\b(?:credit card|debit card|card|cc)\b(?:\s+(?:no\.?|number|ending(?: with| in)?|xx|x+|\*+))*\s*[x*]*\s*(\d{3,6})\b/i) ?? text.match(/\bcard\b[^.]{0,30}?[x*]+(\d{3,6})\b/i);
  const acct = text.match(/\b(?:a\/?c|acct|account|ac)\b(?:\s+(?:no\.?|number|ending(?: with| in)?))?[\s:.]*(?:xx|x+|\*+|\.{2,})?\s*[x*]*(\d{3,6})\b/i);
  const isCredit = /credit card|\bcc\b|card ending|card no|card xx|\bcard\b\s*[x*]*\d{3,6}/i.test(text) && !/debit card/i.test(text);
  if (card && (isCredit || !acct)) {
    out.instrument = /debit card/i.test(text) ? "account" : "card";
    out.last4 = card[1].slice(-4);
  } else if (acct) {
    out.instrument = "account";
    out.last4 = acct[1].slice(-4);
  } else if (/wallet|paytm|amazon pay balance|cred cash|cred wallet/i.test(text)) {
    out.instrument = "wallet";
  }

  // Direction
  const debitWords = /\b(debited|spent|paid|sent|withdrawn|purchase|txn of|transaction of|used|dr\b|debit)\b/;
  const creditWords = /\b(credited|received|deposited|refund(?:ed)?|reversal|cr\b|added to)\b/;
  const d = low.search(debitWords);
  const c = low.search(creditWords);
  if (d >= 0 && (c < 0 || d < c)) out.direction = "debit";
  else if (c >= 0) out.direction = "credit";
  // "payment of Rs X received on your credit card" / "thank you for your payment": money towards the card's bill.
  if (out.instrument === "card" && (/payment (?:of|for)?.{0,30}(?:received|credited)|received .{0,30}payment|thank you for (?:the |your )?payment|payment .{0,20}has been (?:received|credited|processed)/i.test(text) || (out.direction === "credit" && /\bpayment\b/.test(low)))) {
    out.cardPayment = true;
    out.direction = "credit";
  }

  // Reference
  const ref = text.match(/\b(?:upi\s*ref(?:erence)?(?:\s*no)?|ref(?:erence)?\s*(?:no|number|id)?|refno|rrn|utr|txn\s*(?:id|no)|imps\s*ref)\s*[.:#-]?\s*([A-Za-z0-9]{6,22})\b/i);
  out.ref = ref ? ref[1] : null;

  out.date = parseDate(text, Number(today.slice(0, 4)));
  out.merchant = merchantOf(text);
  if (out.merchant && out.bank && out.merchant.toLowerCase().includes(out.bank.toLowerCase().split(" ")[0])) out.merchant = null;

  out.confidence = ((out.amount ? 4 : 0) + (out.direction ? 3 : 0) + (out.last4 || out.instrument === "wallet" ? 2 : 0) + (out.date ? 1 : 0)) / 10;
  if (out.ignore) out.confidence = 0;
  return out;
}

/** A best guess at the category from the merchant name. Your own past entries win over this list. */
const CATS: [RegExp, string][] = [
  [/swiggy|zomato|domino|pizza|kfc|mcdonald|burger|cafe|coffee|starbucks|restaurant|hotel|food|eat|chai|bakery|biryani|dunzo daily/i, "Food & dining"],
  [/blinkit|zepto|instamart|bigbasket|grofers|dmart|reliance fresh|more retail|grocery|supermarket|jiomart/i, "Groceries"],
  [/bpcl|hpcl|iocl|indian oil|petrol|fuel|shell|bharat petroleum|hindustan petroleum/i, "Fuel"],
  [/uber|ola|rapido|metro|irctc|redbus|\bbus\b|cab|auto|namma yatri|fastag/i, "Transport"],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa|croma|reliance digital|decathlon|ikea|tata cliq/i, "Shopping"],
  [/airtel|\bjio\b|vodafone|\bvi\b|bsnl|act fibernet|broadband|recharge/i, "Mobile & internet"],
  [/electricity|kseb|bescom|tneb|water|gas|lpg|indane|bharat gas|msedcl/i, "Utilities"],
  [/netflix|spotify|prime video|hotstar|youtube|apple\.com|google play|sonyliv|zee5/i, "Subscriptions"],
  [/pharma|apollo|medplus|1mg|netmeds|hospital|clinic|diagnostic|lab|doctor/i, "Health"],
  [/makemytrip|goibibo|indigo|air india|vistara|akasa|spicejet|oyo|airbnb|booking\.com|cleartrip/i, "Travel"],
  [/bookmyshow|pvr|inox|cinema|movie|steam|playstation/i, "Entertainment"],
  [/lic|insurance|policybazaar|acko|digit|hdfc ergo|star health|icici lombard/i, "Insurance"],
  [/salon|spa|barber|urban company/i, "Personal care"],
  [/school|college|udemy|coursera|byju|fees/i, "Education"],
  [/rent|nobroker|housing/i, "Rent"],
];

export function guessCategory(merchant: string | null, known: { description?: string | null; category?: string | null }[], categories: string[]): string | null {
  if (!merchant) return null;
  const m = merchant.toLowerCase();
  // Your own history first: the category you last used for this name.
  const hit = [...known].reverse().find((t) => t.category && t.description && (t.description.toLowerCase().includes(m) || m.includes(t.description.toLowerCase())));
  if (hit?.category) return hit.category;
  const g = CATS.find(([re]) => re.test(merchant))?.[1] ?? null;
  return g && categories.includes(g) ? g : null;
}

/** Title-case a merchant for display ("SWIGGY" → "Swiggy", "swiggy upi" → "Swiggy Upi"). */
export function niceName(s: string | null): string | null {
  if (!s) return null;
  return s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length <= 2 && /[a-z]/.test(w) && w !== "of" ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
