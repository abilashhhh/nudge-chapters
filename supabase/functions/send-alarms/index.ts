// Sends push notifications for task / checklist / reminder alarms that are due.
// Called every minute by pg_cron (see migrations/0005). Authenticated with a shared secret header
// (verify_jwt is off because the caller is the database scheduler, not a signed-in user).
// Deploy: supabase functions deploy send-alarms --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const { data: secrets, error: se } = await sb.from("app_secrets").select("name,value");
  if (se) return new Response(se.message, { status: 500 });
  const s = Object.fromEntries((secrets ?? []).map((r) => [r.name, r.value]));
  if (req.headers.get("x-cron-secret") !== s.cron_secret) return new Response("forbidden", { status: 403 });
  webpush.setVapidDetails(s.vapid_subject, s.vapid_public, s.vapid_private);

  const { data: due, error } = await sb.rpc("due_alarm_pushes");
  if (error) return new Response(error.message, { status: 500 });
  let sent = 0, gone = 0;
  for (const a of due ?? []) {
    // Claim it first so a slow run can't send it twice.
    const { error: claimErr } = await sb.from("alarm_pushes").insert({ item_id: a.item_id, alarm_key: a.alarm_key });
    if (claimErr) continue;
    const { data: subs } = await sb.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", a.user_id);
    const payload = JSON.stringify({ title: a.title, body: a.kind === "reminder" ? "Reminder" : a.kind === "checklist" ? "Checklist" : "Task", tag: `alarm-${a.item_id}`, url: "./?alarm=" + a.item_id });
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 600, urgency: "high" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await sb.from("push_subscriptions").delete().eq("id", sub.id);
          gone++;
        }
      }
    }
  }
  return new Response(JSON.stringify({ due: due?.length ?? 0, sent, removed: gone }), { headers: { "Content-Type": "application/json" } });
});
