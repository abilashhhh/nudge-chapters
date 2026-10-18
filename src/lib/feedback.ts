"use client";

// Feature requests & feedback (Menu → Feedback) and the admin dashboard's data.
// Signed in: rows in the `feedback` table (you see your own; admins see everyone's) and the admin_* database
// functions, which refuse anyone who isn't an admin. Without an account: kept on this device only.

import { useCallback, useEffect, useState } from "react";
import { getAdminSupabase, getSupabase, supabaseConfigured } from "./data/supabase";
import { newId } from "./data/repo";
import { useStore } from "./store";

export type FeedbackKind = "feature" | "feedback" | "bug";
export type FeedbackStatus = "new" | "planned" | "in_progress" | "done" | "declined";

export interface Feedback {
  id: string;
  user_id?: string;
  kind: FeedbackKind;
  title: string;
  body?: string | null;
  area?: string | null;
  rating?: number | null;
  status: FeedbackStatus;
  admin_reply?: string | null;
  created_at: string;
  updated_at?: string;
}

export const KIND_LABEL: Record<FeedbackKind, string> = { feature: "Feature request", feedback: "Feedback", bug: "Something's broken" };
export const STATUS_LABEL: Record<FeedbackStatus, string> = { new: "Received", planned: "Planned", in_progress: "Being built", done: "Done", declined: "Not planned" };

const LOCAL_KEY = "nudge:local:feedback:v1";
const cloud = () => useStore.getState().repo?.kind === "supabase" && supabaseConfigured;

function readLocal(): Feedback[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as Feedback[];
  } catch {
    return [];
  }
}
function writeLocal(list: Feedback[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    /* storage full */
  }
}

/** Your own feedback (admins: everyone's, newest first). */
export function useFeedback(all = false) {
  const [list, setList] = useState<Feedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    if (!cloud()) return setList(readLocal().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
    const sb = getSupabase();
    const { data: s } = await sb.auth.getSession();
    let q = sb.from("feedback").select("*").order("created_at", { ascending: false }).limit(500);
    if (!all && s.session) q = q.eq("user_id", s.session.user.id);
    const { data, error: e } = await q;
    if (e) setError(/feedback/.test(e.message) && /exist|schema/.test(e.message) ? "Feedback isn't set up on the server yet." : e.message);
    setList((data ?? []) as Feedback[]);
  }, [all]);
  useEffect(() => {
    void load();
  }, [load]);
  return { list, error, reload: load };
}

export async function sendFeedback(f: Pick<Feedback, "kind" | "title" | "body" | "area" | "rating">): Promise<void> {
  if (!cloud()) {
    writeLocal([{ ...f, id: newId(), status: "new", created_at: new Date().toISOString() }, ...readLocal()]);
    return;
  }
  const { error } = await getSupabase().from("feedback").insert({ kind: f.kind, title: f.title, body: f.body || null, area: f.area || null, rating: f.rating ?? null });
  if (error) throw new Error(error.message);
}

export async function updateFeedback(id: string, patch: Partial<Feedback>): Promise<void> {
  if (!cloud()) {
    writeLocal(readLocal().map((x) => (x.id === id ? { ...x, ...patch } : x)));
    return;
  }
  const { error } = await getSupabase().from("feedback").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFeedback(id: string): Promise<void> {
  if (!cloud()) {
    writeLocal(readLocal().filter((x) => x.id !== id));
    return;
  }
  const { error } = await getSupabase().from("feedback").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Admin (the separate /admin site, signed in as the admin account through its own connection)

const ADMIN_DOMAIN = "nudgechapters.in";

/** Sign in to the admin site with a username ("admin") or a full email. Refuses anyone who isn't an admin. */
export async function adminSignIn(username: string, password: string): Promise<void> {
  const sb = getAdminSupabase();
  const email = username.includes("@") ? username.trim() : `${username.trim().toLowerCase()}@${ADMIN_DOMAIN}`;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(/invalid/i.test(error.message) ? "Wrong username or password." : error.message);
  const { data } = await sb.rpc("is_admin");
  if (data !== true) {
    await sb.auth.signOut();
    throw new Error("This account isn't an admin.");
  }
}

export async function adminSignOut(): Promise<void> {
  await getAdminSupabase().auth.signOut();
}

/** Is the admin site signed in as an admin right now? */
export async function adminSession(): Promise<boolean> {
  const sb = getAdminSupabase();
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return false;
  const { data } = await sb.rpc("is_admin");
  return data === true;
}

export async function adminChangePassword(password: string): Promise<void> {
  const { error } = await getAdminSupabase().auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function adminFeedback(): Promise<Feedback[]> {
  const { data, error } = await getAdminSupabase().from("feedback").select("*").order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as Feedback[];
}

export async function adminUpdateFeedback(id: string, patch: Partial<Feedback>): Promise<void> {
  const { error } = await getAdminSupabase().from("feedback").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  country: string | null;
  currency: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  last_active: string | null;
  is_admin: boolean;
  onboarding_done: boolean | null;
  net_worth: number | null;
  cash: number | null;
  investments: number | null;
  liabilities: number | null;
  net_worth_date: string | null;
  usage: Record<string, number>;
  feedback_open: number;
}

export interface AdminUserDetail {
  history: { date: string; net_worth: number; cash: number; investments: number; liabilities: number }[];
  usage: Record<string, number>;
  by_month: { month: string; transactions: number }[];
  errors: number;
}

export async function adminUsers(): Promise<AdminUser[]> {
  const { data, error } = await getAdminSupabase().rpc("admin_users");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUser[];
}

export async function adminUserDetail(uid: string): Promise<AdminUserDetail> {
  const { data, error } = await getAdminSupabase().rpc("admin_user_detail", { uid });
  if (error) throw new Error(error.message);
  return data as AdminUserDetail;
}
