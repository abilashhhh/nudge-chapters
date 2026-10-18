import { describe, expect, it } from "vitest";
import { guessCategory, parseSms } from "./parse";

const T = "2026-10-17";
const p = (body: string, sender?: string) => parseSms(body, sender, T);

describe("bank SMS", () => {
  it("HDFC UPI debit", () => {
    const r = p("Sent Rs.215.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 16/10/26\nRef 628912345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808", "AX-HDFCBK");
    expect(r).toMatchObject({ amount: 215, direction: "debit", instrument: "account", last4: "1234", bank: "HDFC Bank", ref: "628912345678", date: "2026-10-16" });
    expect(r.merchant?.toLowerCase()).toBe("swiggy");
    expect(r.confidence).toBe(1);
  });
  it("SBI UPI debit without a currency sign", () => {
    const r = p("Dear UPI user A/C X5678 debited by 500.0 on date 16Oct26 trf to ZOMATO Refno 628900011122. If not u? call 1800111109. -SBI", "JD-SBIUPI");
    expect(r).toMatchObject({ amount: 500, direction: "debit", last4: "5678", bank: "State Bank of India", date: "2026-10-16", ref: "628900011122" });
    expect(r.merchant).toBe("ZOMATO");
  });
  it("salary credit with balance", () => {
    const r = p("Your A/c XX9012 is credited with INR 50,000.00 on 16-10-2026 by NEFT from ACME TECH PVT LTD. Avl Bal INR 75,123.45 -Kotak Bank", "VM-KOTAKB");
    expect(r).toMatchObject({ amount: 50000, direction: "credit", instrument: "account", last4: "9012", balance: 75123.45, bank: "Kotak Bank", date: "2026-10-16" });
    expect(r.merchant).toBe("ACME TECH");
  });
  it("ICICI credit card spend with limit left", () => {
    const r = p("INR 1,082.00 spent using ICICI Bank Card XX5001 on 11-Oct-26 on AMAZON PAY IN. Avl Limit: INR 1,23,456.00. If not you, call 1800 2662/SMS BLOCK 5001 to 9215676766.", "AD-ICICIT");
    expect(r).toMatchObject({ amount: 1082, direction: "debit", instrument: "card", last4: "5001", availableLimit: 123456, date: "2026-10-11", bank: "ICICI Bank" });
    expect(r.balance).toBeNull();
  });
  it("HDFC credit card spend", () => {
    const r = p("Spent Rs.316.90 On HDFC Bank Card 3996 At AMAZON On 2026-10-15:14:41:22 Not You? To Block+Reissue Call 18002586161", "VK-HDFCBK");
    expect(r).toMatchObject({ amount: 316.9, direction: "debit", instrument: "card", last4: "3996", date: "2026-10-15" });
    expect(r.merchant).toBe("AMAZON");
  });
  it("Axis credit card spend", () => {
    const r = p("Spent INR 215 Axis Bank Card no. XX3609 16-10-26 11:20:15 IST SWIGGY Avl Limit: INR 52341.50 Not you? SMS BLOCK 3609 to 919951860002", "AX-AXISBK");
    expect(r).toMatchObject({ amount: 215, direction: "debit", instrument: "card", last4: "3609", availableLimit: 52341.5, date: "2026-10-16" });
  });
  it("SBI card spend", () => {
    const r = p("Transaction alert: Rs.25,790.56 spent on your SBI Credit Card ending 1697 at CRED on 16/10/26. Trxn. not done by you? Report at https://sbicard.com/Dispute", "BP-SBICRD");
    expect(r).toMatchObject({ amount: 25790.56, direction: "debit", instrument: "card", last4: "1697", date: "2026-10-16", merchant: "CRED" });
  });
  it("card bill payment received", () => {
    const r = p("Payment of Rs 1,155.97 has been received on your HDFC Bank Credit Card ending 3996 on 15-10-2026. Thank you.", "VM-HDFCBK");
    expect(r).toMatchObject({ amount: 1155.97, direction: "credit", instrument: "card", last4: "3996", cardPayment: true });
  });
  it("IDFC debit card / ATM", () => {
    const r = p("Rs 2,000.00 withdrawn at ATM using your IDFC FIRST Bank Debit Card XX4321 on 16-OCT-26. Avl bal Rs 10,500.00", "AX-IDFCFB");
    expect(r).toMatchObject({ amount: 2000, direction: "debit", instrument: "account", last4: "4321", balance: 10500 });
  });
  it("refund to a card", () => {
    const r = p("Refund of Rs 499.00 from MYNTRA credited to your Axis Bank Credit Card XX1811 on 15-10-26.", "AX-AXISBK");
    expect(r).toMatchObject({ amount: 499, direction: "credit", instrument: "card", last4: "1811", cardPayment: false });
  });
  it("ignores OTPs, reminders and failed payments", () => {
    expect(p("123456 is your OTP for txn of Rs 500.00 at AMAZON on HDFC Bank Card 3996. Valid 10 mins.").ignore).toBe("OTP");
    expect(p("Your HDFC Bank Credit Card 3996 statement: Total due Rs 1,155.97, Min due Rs 200.00, Due date 15-10-2026.").ignore).toBe("Reminder, not a payment");
    expect(p("Txn of Rs 500.00 on Card XX3609 at SWIGGY is declined due to insufficient limit.").ignore).toBe("Failed or declined");
  });
  it("category: your own history first, then the merchant name", () => {
    const cats = ["Food & dining", "Shopping", "Fuel"];
    expect(guessCategory("SWIGGY", [], cats)).toBe("Food & dining");
    expect(guessCategory("AMAZON", [{ description: "Amazon", category: "Fuel" }], cats)).toBe("Fuel");
    expect(guessCategory("Random Shop", [], cats)).toBeNull();
  });
  it("reads the merchant after the date (ICICI cards)", () => {
    const p = parseSms("INR 970.00 spent using ICICI Bank Card XX5001 on 18-Oct-26 on AMAZON PAY IN G. Avl Limit: INR 92,429.35. If not you, call 1800 2662/SMS BLOCK 5001 to 9215676766", "ICICIT", "2026-10-18");
    expect(p).toMatchObject({ amount: 970, direction: "debit", instrument: "card", last4: "5001", date: "2026-10-18", merchant: "AMAZON PAY IN G", availableLimit: 92429.35 });
  });
});
