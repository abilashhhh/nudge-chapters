"use client";

import { Cake, Mail, MessageCircle, Phone, Plus, Search, Star, Trash2, Upload, Users } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { daysToBirthday, newContacts, parseVcf } from "@/lib/contacts";
import { formatDate } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import { useStore } from "@/lib/store";
import type { Contact, ContactPhone } from "@/lib/types";
import { Button } from "../ui/button";
import { Field, Input, Textarea } from "../ui/form";
import { ConfirmSheet, Sheet } from "../ui/sheet";
import { EmptyState } from "../ui/misc";
import { V2PageHeader } from "./ui";

const TONES = ["bg-brand/15 text-brand", "bg-ok/15 text-ok", "bg-warn/15 text-warn", "bg-future-soft text-future-ink", "bg-danger/10 text-danger", "bg-surface-3 text-ink-2"];
function tone(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}
function initials(name: string) {
  const w = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "?") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}
function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold", tone(name), size === "lg" ? "h-16 w-16 text-[22px]" : "h-10 w-10 text-[14px]")} aria-hidden>
      {initials(name)}
    </span>
  );
}
const letterOf = (name: string) => {
  const c = name.trim()[0]?.toUpperCase() ?? "#";
  return /[A-Z]/.test(c) ? c : "#";
};
/** Indian numbers without a country code get +91 for WhatsApp. */
const waNumber = (n: string) => {
  const d = n.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d.replace(/^0+/, "");
};
const birthdayText = (b: string) => (b.startsWith("1604") ? formatDate(`2000${b.slice(4)}`, "short") : formatDate(b, "medium"));

export function ContactsScreen() {
  const { ds, today } = useFinance();
  const addMany = useStore((s) => s.addMany);
  const contacts = ds.contacts ?? [];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Contact | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    const list = !s
      ? contacts
      : contacts.filter((c) => c.name.toLowerCase().includes(s) || (c.org ?? "").toLowerCase().includes(s) || c.emails.some((e) => e.toLowerCase().includes(s)) || (digits.length >= 3 && c.phones.some((p) => p.number.replace(/\D/g, "").includes(digits))));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [contacts, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Contact[]>();
    for (const c of filtered) m.set(letterOf(c.name), [...(m.get(letterOf(c.name)) ?? []), c]);
    return [...m.entries()].sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  }, [filtered]);
  const favorites = contacts.filter((c) => c.favorite);
  const birthdays = contacts
    .map((c) => ({ c, d: daysToBirthday(c.birthday, today) }))
    .filter((x): x is { c: Contact; d: number } => x.d != null && x.d <= 30)
    .sort((a, b) => a.d - b.d);

  const importFile = async (f: File) => {
    setBusy(true);
    try {
      const drafts = parseVcf(await f.text());
      if (!drafts.length) {
        toast.error("No contacts found in that file. Export a .vcf from your phone's Contacts.");
        return;
      }
      const fresh = newContacts(drafts, contacts);
      for (let i = 0; i < fresh.length; i += 200) await addMany("contacts", fresh.slice(i, i + 200) as Partial<Contact>[]);
      toast.success(fresh.length ? `${fresh.length} contact${fresh.length === 1 ? "" : "s"} added${drafts.length > fresh.length ? ` · ${drafts.length - fresh.length} already saved` : ""}` : "All of these are already saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  const letters = groups.map(([l]) => l);
  return (
    <>
      <V2PageHeader
        title="Contacts"
        actions={
          <div className="flex gap-2">
            <Button icon={<Upload className="h-4 w-4" />} loading={busy} onClick={() => file.current?.click()}>
              <span className="sm:hidden">Import</span>
              <span className="hidden sm:inline">Import .vcf</span>
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen("new")}>
              New
            </Button>
          </div>
        }
      />
      <input ref={file} type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />

      {contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          body="Export your contacts as a .vcf file (iPhone: Contacts → Lists → long-press All Contacts → Export; Google Contacts: Export → vCard) and import it here. Numbers you already have are skipped."
          action={
            <Button variant="primary" icon={<Upload className="h-4 w-4" />} loading={busy} onClick={() => file.current?.click()}>
              Import .vcf
            </Button>
          }
        />
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${contacts.length} contacts by name, number or company`}
              aria-label="Search contacts"
              className="h-11 w-full rounded-2xl border border-line bg-surface pl-9 pr-3 text-[14.5px] outline-none focus:border-line-strong"
            />
          </div>

          {!q && birthdays.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                <Cake className="h-4 w-4 text-warn" aria-hidden /> Birthdays coming up
              </h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {birthdays.slice(0, 5).map(({ c, d }) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setOpen(c)} className="flex w-full items-center justify-between text-left text-[13.5px] hover:underline">
                      <span>{c.name}</span>
                      <span className={cn("text-[12.5px]", d === 0 ? "font-semibold text-warn" : "text-ink-3")}>{d === 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d} days`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!q && favorites.length > 0 && (
            <section aria-label="Favourites">
              <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">Favourites</h2>
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                {favorites.map((c) => (
                  <button key={c.id} type="button" onClick={() => setOpen(c)} className="flex w-16 shrink-0 flex-col items-center gap-1">
                    <Avatar name={c.name} />
                    <span className="w-full truncate text-center text-[12px]">{c.name.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {letters.length > 4 && !q && (
            <nav aria-label="Jump to letter" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {letters.map((l) => (
                <a key={l} href={`#letter-${l}`} className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-surface-3/70 px-2 text-[12px] font-semibold text-ink-2 hover:text-ink">
                  {l}
                </a>
              ))}
            </nav>
          )}

          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-4 text-[14px] text-ink-2">No contact matches “{q}”.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {groups.map(([l, list]) => (
                <section key={l} id={`letter-${l}`} aria-label={l} className="scroll-mt-20">
                  <h3 className="sticky top-0 z-[1] border-b border-line bg-surface-2/95 px-4 py-1 text-[12px] font-semibold text-ink-3 backdrop-blur">{l}</h3>
                  <ul className="divide-y divide-line/70">
                    {list.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => setOpen(c)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
                          <Avatar name={c.name} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 truncate text-[14.5px] font-medium">
                              {c.name}
                              {c.favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-warn text-warn" aria-label="Favourite" />}
                            </span>
                            <span className="block truncate text-[12.5px] text-ink-3">{[c.phones[0]?.number, c.org].filter(Boolean).join(" · ") || c.emails[0] || "No number"}</span>
                          </span>
                          {c.phones[0] && (
                            <a href={`tel:${c.phones[0].number.replace(/\s/g, "")}`} onClick={(e) => e.stopPropagation()} aria-label={`Call ${c.name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-3 hover:text-ink">
                              <Phone className="h-4 w-4" />
                            </a>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <p className="text-[12px] text-ink-3">
            {filtered.length} of {contacts.length} contacts. Photos aren&apos;t imported. Importing the same file again only adds people who aren&apos;t here yet.
          </p>
        </div>
      )}
      {open && <ContactSheet contact={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ContactSheet({ contact, onClose }: { contact: Contact | null; onClose: () => void }) {
  const { add, patch, remove } = useStore.getState();
  const [editing, setEditing] = useState(!contact);
  const [name, setName] = useState(contact?.name ?? "");
  const [phones, setPhones] = useState<ContactPhone[]>(contact?.phones.length ? contact.phones : [{ label: "Mobile", number: "" }]);
  const [emails, setEmails] = useState((contact?.emails ?? []).join(", "));
  const [org, setOrg] = useState(contact?.org ?? "");
  const [birthday, setBirthday] = useState(contact?.birthday && !contact.birthday.startsWith("1604") ? contact.birthday : "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        phones: phones.filter((p) => p.number.trim()).map((p) => ({ label: p.label || "Mobile", number: p.number.trim() })),
        emails: emails.split(",").map((e) => e.trim()).filter(Boolean),
        org: org.trim() || null,
        birthday: birthday || (contact?.birthday?.startsWith("1604") ? contact.birthday : null),
        notes: notes.trim() || null,
      };
      if (contact) await patch("contacts", contact.id, body);
      else await add("contacts", { ...body, favorite: false });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (contact && !editing) {
    const c = contact;
    return (
      <Sheet
        open
        onClose={onClose}
        size="sm"
        title={c.name}
        footer={
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)}>
              Delete
            </Button>
            <div className="flex gap-2">
              <Button icon={<Star className={cn("h-4 w-4", c.favorite && "fill-warn text-warn")} />} onClick={() => void patch("contacts", c.id, { favorite: !c.favorite })}>
                {c.favorite ? "Favourite" : "Add to favourites"}
              </Button>
              <Button variant="primary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={c.name} size="lg" />
            <div className="min-w-0">
              {(c.org || c.title) && <p className="truncate text-[14px] text-ink-2">{[c.title, c.org].filter(Boolean).join(" · ")}</p>}
              {c.birthday && (
                <p className="flex items-center gap-1 text-[13px] text-ink-3">
                  <Cake className="h-3.5 w-3.5" aria-hidden /> {birthdayText(c.birthday)}
                </p>
              )}
            </div>
          </div>
          {c.phones.length > 0 && (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {c.phones.map((p, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-ink-3">{p.label}</span>
                    <span className="num block truncate text-[15px]">{p.number}</span>
                  </span>
                  <a href={`tel:${p.number.replace(/\s/g, "")}`} aria-label="Call" className="flex h-9 w-9 items-center justify-center rounded-full bg-ok/15 text-ok hover:bg-ok/25">
                    <Phone className="h-4 w-4" />
                  </a>
                  <a href={`https://wa.me/${waNumber(p.number)}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-ink-2 hover:text-ink">
                    <MessageCircle className="h-4 w-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {c.emails.length > 0 && (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {c.emails.map((e) => (
                <li key={e}>
                  <a href={`mailto:${e}`} className="flex items-center gap-2 px-3 py-2.5 text-[14px] hover:bg-surface-2">
                    <Mail className="h-4 w-4 text-ink-3" aria-hidden /> {e}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {c.address && <p className="rounded-2xl bg-surface-2 px-3 py-2.5 text-[13.5px] text-ink-2">{c.address}</p>}
          {c.notes && <p className="whitespace-pre-wrap rounded-2xl bg-surface-2 px-3 py-2.5 text-[13.5px] text-ink-2">{c.notes}</p>}
        </div>
        <ConfirmSheet
          open={confirm}
          onClose={() => setConfirm(false)}
          title={`Delete ${c.name}?`}
          body="This removes the contact from this app only, not from your phone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await remove("contacts", c.id);
            setConfirm(false);
            onClose();
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title={contact ? `Edit ${contact.name}` : "New contact"}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={contact ? () => setEditing(false) : onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name" htmlFor="ct-name">
          <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!contact} />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink-2">Phone numbers</span>
          {phones.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label="Label" className="w-28" value={p.label} onChange={(e) => setPhones(phones.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Input aria-label="Number" inputMode="tel" className="flex-1" value={p.number} onChange={(e) => setPhones(phones.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} />
            </div>
          ))}
          <button type="button" onClick={() => setPhones([...phones, { label: "Mobile", number: "" }])} className="self-start text-[13px] font-medium text-brand">
            + Another number
          </button>
        </div>
        <Field label="Email" htmlFor="ct-email" optional>
          <Input id="ct-email" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="Separate several with commas" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company" htmlFor="ct-org" optional>
            <Input id="ct-org" value={org} onChange={(e) => setOrg(e.target.value)} />
          </Field>
          <Field label="Birthday" htmlFor="ct-bday" optional>
            <Input id="ct-bday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="ct-notes" optional>
          <Textarea id="ct-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
      </div>
    </Sheet>
  );
}
