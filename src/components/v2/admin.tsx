"use client";

import { Activity, ArrowLeft, Lightbulb, ShieldAlert, Users, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate, formatMonth } from "@/lib/dates";
import { STATUS_LABEL, adminUserDetail, adminUsers, updateFeedback, useFeedback, useIsAdmin, type AdminUser, type AdminUserDetail, type Feedback, type FeedbackStatus } from "@/lib/feedback";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { Button } from "../ui/button";
import { Field, Select, Textarea } from "../ui/form";
import { EmptyState, Tabs } from "../ui/misc";
import { Sheet } from "../ui/sheet";
import { EntityIcon } from "./entity-icon";
import { FEEDBACK_STATUSES, FeedbackCard } from "./feedback";
import { StatTile, V2PageHeader } from "./ui";

const tick = { fill: "var(--ink-3)", fontSize: 11.5 };
const kfmt = (v: number) => (Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
const ago = (iso: string | null) => {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
};

/** Admin dashboard: everyone who uses the app, their net worth and what they use, and every request and piece of feedback. */
export function AdminScreen() {
  const admin = useIsAdmin();
  const cloud = useStore((s) => s.repo?.kind === "supabase");
  const [tab, setTab] = useState<"users" | "feedback">("users");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AdminUser | null>(null);
  const fb = useFeedback(true);
  const load = useCallback(async () => {
    try {
      setUsers(await adminUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load users.");
    }
  }, []);
  useEffect(() => {
    if (admin) void load();
  }, [admin, load]);

  if (!cloud || !admin)
    return (
      <>
        <V2PageHeader title="Admin" />
        <EmptyState icon={ShieldAlert} title="Admins only" body={cloud ? "Your account doesn't have admin access." : "Sign in with an admin account to see this."} />
      </>
    );
  if (open) return <UserDetail user={open} feedback={(fb.list ?? []).filter((f) => f.user_id === open.id)} onBack={() => setOpen(null)} reloadFeedback={fb.reload} />;

  const week = Date.now() - 7 * 864e5;
  const active7 = (users ?? []).filter((u) => u.last_active && new Date(u.last_active).getTime() >= week).length;
  const openFb = (fb.list ?? []).filter((f) => f.status === "new" || f.status === "planned" || f.status === "in_progress").length;
  const tracked = (users ?? []).reduce((s, u) => s + (u.net_worth ?? 0), 0);
  return (
    <>
      <V2PageHeader title="Admin" />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Mini icon={Users} label="People" value={String(users?.length ?? 0)} note={`${(users ?? []).filter((u) => u.onboarding_done).length} finished setup`} />
        <Mini icon={Activity} label="Active this week" value={String(active7)} />
        <StatTile label="Net worth tracked" value={tracked} note="Sum of everyone's latest" />
        <button type="button" className="text-left" onClick={() => setTab("feedback")}>
          <Mini icon={Lightbulb} label="Open requests" value={String(openFb)} note={`${fb.list?.length ?? 0} in all`} />
        </button>
      </div>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "users", label: "Users", count: users?.length ?? 0 },
          { id: "feedback", label: "Requests & feedback", count: fb.list?.length ?? 0 },
        ]}
      />
      {error && <p className="mb-3 text-[13.5px] text-danger">{error}</p>}
      {tab === "users" && (users == null ? <p className="text-ink-3">Loading…</p> : <UserList users={users} onOpen={setOpen} />)}
      {tab === "feedback" && <FeedbackAdmin list={fb.list} users={users ?? []} reload={fb.reload} />}
    </>
  );
}

function UserList({ users, onOpen }: { users: AdminUser[]; onOpen: (u: AdminUser) => void }) {
  const { ctx } = useFinance();
  const [q, setQ] = useState("");
  const shown = users.filter((u) => !q.trim() || `${u.email} ${u.name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="border-b border-line p-3 sm:px-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or name" aria-label="Search users" className="h-9 w-full rounded-xl border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-future sm:w-72" />
      </div>
      <ul className="divide-y divide-line/70">
        {shown.map((u) => {
          const used = Object.values(u.usage ?? {}).filter((n) => n > 0).length;
          return (
            <li key={u.id}>
              <button type="button" onClick={() => onOpen(u)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-2 sm:px-4">
                <EntityIcon kind="person" name={u.name || u.email || "?"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14.5px] font-semibold">{u.name || u.email}</span>
                    {u.is_admin && <span className="rounded-full bg-future-soft px-1.5 text-[10.5px] font-semibold uppercase text-future-ink">Admin</span>}
                  </span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {u.name ? `${u.email} · ` : ""}Joined {formatDate(u.created_at.slice(0, 10), "medium")} · active {ago(u.last_active).toLowerCase()} · uses {used} feature{used === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block text-[14.5px] font-semibold">{u.net_worth != null ? formatMoney(u.net_worth, { ...ctx, currency: u.currency || ctx.currency }) : "—"}</span>
                  <span className="block text-[11.5px] text-ink-3">{u.feedback_open ? `${u.feedback_open} open request${u.feedback_open === 1 ? "" : "s"}` : "net worth"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function UserDetail({ user, feedback, onBack, reloadFeedback }: { user: AdminUser; feedback: Feedback[]; onBack: () => void; reloadFeedback: () => void }) {
  const { ctx } = useFinance();
  const [d, setD] = useState<AdminUserDetail | null>(null);
  const [reply, setReply] = useState<Feedback | null>(null);
  useEffect(() => {
    void adminUserDetail(user.id).then(setD, (e) => toast.error(e.message));
  }, [user.id]);
  const c = { ...ctx, currency: user.currency || ctx.currency };
  const m = (n: number | null) => (n == null ? "—" : formatMoney(n, c));
  const usage = useMemo(() => Object.entries(d?.usage ?? user.usage ?? {}).sort((a, b) => b[1] - a[1]), [d, user.usage]);
  const max = Math.max(1, ...usage.map(([, n]) => n));
  return (
    <>
      <button type="button" onClick={onBack} className="mb-4 inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13.5px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All users
      </button>
      <div className="mb-4 flex items-center gap-3">
        <EntityIcon kind="person" name={user.name || user.email || "?"} size="lg" />
        <div className="min-w-0">
          <h1 className="display truncate text-[22px] font-semibold">{user.name || user.email}</h1>
          <p className="truncate text-[13px] text-ink-3">
            {user.email} · {user.country ?? "—"} · joined {formatDate(user.created_at.slice(0, 10), "medium")} · last sign-in {ago(user.last_sign_in_at).toLowerCase()}
          </p>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Mini icon={Wallet} label="Net worth" value={m(user.net_worth)} note={user.net_worth_date ? `as of ${formatDate(user.net_worth_date, "medium")}` : "No snapshot yet"} />
        <Mini icon={Wallet} label="Cash" value={m(user.cash)} />
        <Mini icon={Wallet} label="Investments" value={m(user.investments)} />
        <Mini icon={Activity} label="Owes" value={m(user.liabilities)} note={d ? `${d.errors} app error${d.errors === 1 ? "" : "s"} in 30 days` : undefined} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-[15px] font-semibold">Net worth over time</h2>
          {d && d.history.length >= 2 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.history} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="anw" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(x) => formatDate(x, "short")} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={40} />
                  <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={kfmt} />
                  <Tooltip formatter={(v) => m(Number(v))} labelFormatter={(x) => formatDate(String(x), "long")} />
                  <Area type="monotone" dataKey="net_worth" name="Net worth" stroke="var(--brand)" strokeWidth={2} fill="url(#anw)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-3">{d ? "Not enough snapshots yet — one is saved on each day they open the app." : "Loading…"}</p>
          )}
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-[15px] font-semibold">Entries by month</h2>
          {d && d.by_month.length ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.by_month.slice(-12)} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(x) => formatMonth(x, false)} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
                  <YAxis tick={tick} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                  <Tooltip labelFormatter={(x) => formatMonth(String(x))} />
                  <Bar dataKey="transactions" name="Transactions" fill="var(--future)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-3">{d ? "No transactions yet." : "Loading…"}</p>
          )}
        </section>
      </div>
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-[15px] font-semibold">Features used</h2>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {usage.map(([k, n]) => (
            <li key={k} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem] items-center gap-2 text-[13px]">
              <span className={cn("truncate", n ? "text-ink" : "text-ink-3")}>{k}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="num text-right font-medium">{n}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-4">
        <h2 className="mb-3 text-[15px] font-semibold">Their requests & feedback</h2>
        {feedback.length ? (
          <ul className="flex flex-col gap-3">
            {feedback.map((f) => (
              <FeedbackCard key={f.id} f={f} onChanged={reloadFeedback} admin={{ email: null, onReply: setReply }} />
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-3">Nothing sent yet.</p>
        )}
      </section>
      <ReplySheet f={reply} onClose={() => setReply(null)} onSaved={reloadFeedback} />
    </>
  );
}

function Mini({ icon: Icon, label, value, note }: { icon: typeof Users; label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      <p className="num mt-0.5 truncate text-[19px] font-semibold">{value}</p>
      {note && <p className="truncate text-[11.5px] text-ink-3">{note}</p>}
    </div>
  );
}

function FeedbackAdmin({ list, users, reload }: { list: Feedback[] | null; users: AdminUser[]; reload: () => void }) {
  const [f, setF] = useState<"open" | "all" | FeedbackStatus>("open");
  const [reply, setReply] = useState<Feedback | null>(null);
  const email = (id?: string) => users.find((u) => u.id === id)?.email ?? null;
  if (list == null) return <p className="text-ink-3">Loading…</p>;
  if (!list.length) return <EmptyState icon={Lightbulb} title="No requests yet" body="Feature requests and feedback from everyone show up here." />;
  const shown = list.filter((x) => (f === "all" ? true : f === "open" ? ["new", "planned", "in_progress"].includes(x.status) : x.status === f));
  return (
    <div className="flex flex-col gap-3">
      <div className="no-scrollbar flex gap-1 overflow-x-auto" role="radiogroup" aria-label="Show">
        {(["open", "all", ...FEEDBACK_STATUSES] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={f === s} onClick={() => setF(s)} className={cn("h-8 shrink-0 rounded-full px-3 text-[12.5px] font-medium", f === s ? "bg-inverse text-on-inverse" : "bg-surface-3/70 text-ink-2 hover:text-ink")}>
            {s === "open" ? "Open" : s === "all" ? "All" : STATUS_LABEL[s]} · {s === "all" ? list.length : s === "open" ? list.filter((x) => ["new", "planned", "in_progress"].includes(x.status)).length : list.filter((x) => x.status === s).length}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {shown.map((x) => (
          <FeedbackCard key={x.id} f={x} onChanged={reload} admin={{ email: email(x.user_id), onReply: setReply }} />
        ))}
      </ul>
      <ReplySheet f={reply} onClose={() => setReply(null)} onSaved={reload} />
    </div>
  );
}

function ReplySheet({ f, onClose, onSaved }: { f: Feedback | null; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<FeedbackStatus>("new");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (f) {
      setStatus(f.status);
      setText(f.admin_reply ?? "");
    }
  }, [f]);
  return (
    <Sheet
      open={!!f}
      onClose={onClose}
      title={f ? `Reply: ${f.title}` : "Reply"}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!f) return;
              setBusy(true);
              try {
                await updateFeedback(f.id, { status, admin_reply: text.trim() || null });
                toast.success("Saved — they'll see it in Menu → Feedback.");
                onSaved();
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Couldn't save.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      {f && (
        <div className="space-y-4">
          {f.body && <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-[14px] text-ink-2">{f.body}</p>}
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)}>
              {FEEDBACK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reply" optional help="They see this under their request.">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={4000} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}
