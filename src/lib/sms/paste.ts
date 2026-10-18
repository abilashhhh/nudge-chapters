// Pasted bank messages → one entry per message. Messages separated by blank lines are kept apart; without blank
// lines, each line that reads like a money message is its own message (copying several from the Messages app
// often puts them one per line), otherwise the whole text is one message.

const MONEY = /((rs\.?|inr|₹)\s*[0-9])|((debited|credited|spent|sent|received|paid|withdrawn|deposited)[^0-9]{0,40}[0-9])/i;
const OTP = /(\botp\b|one[ -]time password|verification code|\bpin\b is)/i;

const AMOUNT = /(rs\.?|inr|₹)\s*[0-9]/i;
const ACTION = /\b(debited|credited|spent|sent|received|paid|withdrawn|deposited|transferred|txn|transaction|purchase)\b/i;

export const looksLikeMoney = (s: string) => MONEY.test(s) && !OTP.test(s);
/** A whole message on its own: an amount and what happened to it. */
const complete = (s: string) => AMOUNT.test(s) && ACTION.test(s) && !OTP.test(s);

export function splitMessages(text: string): string[] {
  const t = text.replace(/\r\n?/g, "\n").trim();
  if (!t) return [];
  const blocks = t.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks.map((b) => b.replace(/\s*\n\s*/g, " "));
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every(complete)) return lines;
  return [lines.join(" ")];
}
