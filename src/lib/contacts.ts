// Reads a .vcf address book (iPhone, Google Contacts, Android exports; vCard 2.1 / 3.0 / 4.0) into contacts.
// Photos are skipped on purpose — they'd make every load heavy.

import type { Contact, ContactPhone } from "./types";

export type ContactDraft = Omit<Contact, "id" | "user_id" | "created_at" | "updated_at">;

/** Joins folded lines (a line starting with a space or tab continues the one before). */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if (/^[ \t]/.test(line) && out.length) out[out.length - 1] += line.slice(1);
    // Quoted-printable soft line breaks: "=" at the end means the value goes on.
    else if (out.length && /=$/.test(out[out.length - 1]) && /QUOTED-PRINTABLE/i.test(out[out.length - 1])) out[out.length - 1] = out[out.length - 1].slice(0, -1) + line;
    else out.push(line);
  }
  return out;
}

function decodeQP(s: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(s.charCodeAt(i));
  }
  try {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

const unescape = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

/** Splits a structured value on unescaped semicolons. */
function parts(v: string): string[] {
  return v.split(/(?<!\\);/).map(unescape);
}

const LABEL: Record<string, string> = { cell: "Mobile", mobile: "Mobile", iphone: "iPhone", home: "Home", work: "Work", main: "Main", pager: "Pager", fax: "Fax", other: "Other" };

function phoneLabel(params: string[], abLabel?: string): string {
  const nice = (x: string) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  if (abLabel) return nice(abLabel.replace(/^_\$!<|>!\$_$/g, ""));
  const types = params.flatMap((p) => p.replace(/^type=/i, "").split(",")).map((t) => t.toLowerCase());
  for (const t of ["iphone", "cell", "mobile", "home", "work", "main", "fax", "pager"]) if (types.includes(t)) return LABEL[t] ?? nice(t);
  return "Phone";
}

function birthday(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // No year ("--03-15"): stored with year 1604, the vCard convention for "year unknown".
  m = s.match(/^--(\d{2})-?(\d{2})/);
  if (m) return `1604-${m[1]}-${m[2]}`;
  return null;
}

/** Same number written differently ("+91 94953 76228", "09495376228") → "9495376228" for matching. */
export function phoneKey(n: string): string {
  const d = n.replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

export function parseVcf(text: string): ContactDraft[] {
  const out: ContactDraft[] = [];
  let cur: { fn?: string; n?: string; phones: ContactPhone[]; emails: string[]; org?: string; title?: string; bday?: string | null; adr?: string; note?: string; labels: Record<string, string>; pending: { group: string; params: string[]; value: string }[] } | null = null;
  for (const line of unfold(text)) {
    if (/^BEGIN:VCARD/i.test(line)) {
      cur = { phones: [], emails: [], labels: {}, pending: [] };
      continue;
    }
    if (!cur) continue;
    if (/^END:VCARD/i.test(line)) {
      for (const p of cur.pending) {
        const number = p.value.trim();
        if (number && !cur.phones.some((x) => phoneKey(x.number) === phoneKey(number))) cur.phones.push({ label: phoneLabel(p.params, cur.labels[p.group]), number });
      }
      const name = (cur.fn || cur.n || cur.org || cur.phones[0]?.number || cur.emails[0] || "").trim();
      if (name) {
        out.push({
          name: name.slice(0, 200),
          phones: cur.phones,
          emails: cur.emails,
          org: cur.org?.slice(0, 200) || null,
          title: cur.title?.slice(0, 200) || null,
          birthday: cur.bday ?? null,
          address: cur.adr?.slice(0, 1000) || null,
          notes: cur.note?.slice(0, 4000) || null,
          favorite: false,
        });
      }
      cur = null;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const [nameWithGroup, ...params] = head.split(";");
    const dot = nameWithGroup.indexOf(".");
    const group = dot >= 0 ? nameWithGroup.slice(0, dot) : "";
    const prop = (dot >= 0 ? nameWithGroup.slice(dot + 1) : nameWithGroup).toUpperCase();
    if (params.some((p) => /QUOTED-PRINTABLE/i.test(p))) value = decodeQP(value);
    switch (prop) {
      case "FN":
        cur.fn = unescape(value);
        break;
      case "N": {
        const [last, first, middle, prefix, suffix] = parts(value);
        cur.n = [prefix, first, middle, last, suffix].filter(Boolean).join(" ");
        break;
      }
      case "TEL":
        cur.pending.push({ group, params, value: value.replace(/^tel:/i, "") });
        break;
      case "EMAIL": {
        const e = unescape(value);
        if (e && !cur.emails.includes(e)) cur.emails.push(e);
        break;
      }
      case "ORG":
        cur.org = parts(value).filter(Boolean).join(", ");
        break;
      case "TITLE":
        cur.title = unescape(value);
        break;
      case "BDAY":
        cur.bday = birthday(value);
        break;
      case "ADR":
        cur.adr = parts(value).filter(Boolean).join(", ");
        break;
      case "NOTE":
        cur.note = unescape(value);
        break;
      case "X-ABLABEL":
        if (group) cur.labels[group] = unescape(value);
        break;
    }
  }
  return out;
}

/** Contacts in the file that aren't already saved (same name and a shared number, or the same name with no numbers). */
export function newContacts(drafts: ContactDraft[], existing: Pick<Contact, "name" | "phones">[]): ContactDraft[] {
  const keys = new Set<string>();
  for (const c of existing) {
    const n = c.name.trim().toLowerCase();
    if (!c.phones.length) keys.add(`${n}|`);
    for (const p of c.phones) keys.add(`${n}|${phoneKey(p.number)}`);
  }
  return drafts.filter((d) => {
    const n = d.name.trim().toLowerCase();
    const ks = d.phones.length ? d.phones.map((p) => `${n}|${phoneKey(p.number)}`) : [`${n}|`];
    const dup = ks.some((k) => keys.has(k));
    for (const k of ks) keys.add(k);
    return !dup;
  });
}

/** Days until the next birthday (0 = today), or null when there's no birthday. */
export function daysToBirthday(bday: string | null | undefined, today: string): number | null {
  if (!bday) return null;
  const [ty, tm, td] = today.split("-").map(Number);
  const [, m, d] = bday.split("-").map(Number);
  const t = Date.UTC(ty, tm - 1, td);
  let next = Date.UTC(ty, m - 1, d);
  if (next < t) next = Date.UTC(ty + 1, m - 1, d);
  return Math.round((next - t) / 86_400_000);
}
