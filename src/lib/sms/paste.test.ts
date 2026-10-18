import { describe, expect, it } from "vitest";
import { looksLikeMoney, splitMessages } from "./paste";

describe("pasted SMS", () => {
  it("splits on blank lines and joins wrapped lines", () => {
    const t = "Rs.500 debited from A/c XX1234\non 18-Oct.\n\nINR 1,200 credited to your account XX6080";
    expect(splitMessages(t)).toEqual(["Rs.500 debited from A/c XX1234 on 18-Oct.", "INR 1,200 credited to your account XX6080"]);
  });
  it("one message per line when every line is a money message", () => {
    expect(splitMessages("Rs 100 spent on card 1811\nRs 250 spent on card 3996")).toHaveLength(2);
  });
  it("keeps a single wrapped message together", () => {
    expect(splitMessages("Dear customer, Rs 5,000 received in\nslice A/c xx6080. Bal Rs 10,000")).toHaveLength(1);
  });
  it("spots OTPs and non-money texts", () => {
    expect(looksLikeMoney("123456 is your OTP for Rs 500")).toBe(false);
    expect(looksLikeMoney("Your parcel is out for delivery")).toBe(false);
    expect(looksLikeMoney("Rs.649 spent on HDFC card")).toBe(true);
  });
});
