import type { Investment } from "../types";

export type SavingsSection = "funds" | "stocks" | "epf" | "commodities" | "other";

/** Which My Money tab a saving lives on. */
export function savingsSection(i: Pick<Investment, "type" | "asset_class">): SavingsSection {
  const t = i.type;
  if (t === "mutual_fund") return "funds";
  if (t === "stock" || t === "etf") return "stocks";
  if (t === "epf" || t === "ppf" || t === "nps") return "epf";
  if (t === "gold" || i.asset_class === "gold") return "commodities";
  return "other";
}

/** The tab names, for "Back to …" links. */
export const SAVINGS_SECTION_LABEL: Record<SavingsSection, string> = { funds: "Mutual funds", stocks: "Stocks", epf: "EPF & PF", commodities: "Commodities", other: "Other savings" };
