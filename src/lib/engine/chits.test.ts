import { describe, expect, it } from "vitest";
import type { Chit } from "../types";
import { chitDividendRecord, chitInstallmentOn, chitSummary } from "./chits";

const chit: Chit = {
  id: "c", name: "KSFE", chit_value: 10_00_000, monthly_contribution: 25_000, installments: 40, start_date: "2026-10-01",
  installments_paid_offset: 0, payout_status: "pending", commission_pct: 5, status: "active", installment_records: [],
};

describe("chit dividends", () => {
  it("paying less than the plan records the difference as that month's dividend", () => {
    const recs = chitDividendRecord(chit, 2, 18_000)!;
    expect(recs).toEqual([{ no: 2, payable: 18_000, dividend: 7_000 }]);
    const s = chitSummary({ ...chit, installment_records: recs }, [
      { id: "t1", date: "2026-10-01", type: "chit_installment", amount: 25_000, chit_id: "c", occurrence_date: "2026-10-01" },
      { id: "t2", date: "2026-11-01", type: "chit_installment", amount: 18_000, chit_id: "c", occurrence_date: "2026-11-01" },
    ] as never, "2026-11-02");
    expect(s.paidCount).toBe(2);
    expect(s.auctionSavings).toBe(7_000); // dividend earned
    expect(s.rows[1].payable).toBe(18_000);
  });
  it("leaves full payments and installments with their own auction result alone", () => {
    expect(chitDividendRecord(chit, 3, 25_000)).toBeNull();
    expect(chitDividendRecord({ ...chit, installment_records: [{ no: 3, dividend: 4_000 }] }, 3, 21_000)).toBeNull();
    expect(chitDividendRecord({ ...chit, installment_records: [{ no: 3, payable: 18_750, dividend: 6_250 }] }, 3, 18_750)).toBeNull();
  });
  it("a changed payment amount (25,000 → 18,750) counts the 6,250 left as dividend", () => {
    expect(chitDividendRecord(chit, 4, 18_750)).toEqual([{ no: 4, payable: 18_750, dividend: 6_250 }]);
    // Even when the plan for that month already said 25,000.
    expect(chitDividendRecord({ ...chit, installment_records: [{ no: 4, payable: 25_000 }] }, 4, 18_750)).toEqual([{ no: 4, payable: 18_750, dividend: 6_250 }]);
    // Or an earlier auction result said otherwise: what was paid wins.
    expect(chitDividendRecord({ ...chit, installment_records: [{ no: 4, dividend: 4_000 }] }, 4, 18_750)).toEqual([{ no: 4, payable: 18_750, dividend: 6_250 }]);
  });
  it("finds the installment for a date", () => {
    expect(chitInstallmentOn(chit, "2026-12-01")).toBe(3);
    expect(chitInstallmentOn(chit, "2026-12-02")).toBeNull();
  });
});
