"use client";

import { AlertOctagon, AlertTriangle, BellRing, Info, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import type { Alert, AlertPriority } from "@/lib/engine/alerts";
import { useFinance } from "@/lib/finance";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/misc";
import { Sheet } from "../ui/sheet";

export const PRIORITY: Record<AlertPriority, { label: string; icon: LucideIcon; cls: string }> = {
  critical: { label: "Critical", icon: AlertOctagon, cls: "text-danger" },
  high: { label: "Needs attention", icon: AlertTriangle, cls: "text-warn" },
  normal: { label: "Coming up", icon: BellRing, cls: "text-future-ink" },
  info: { label: "For your information", icon: Info, cls: "text-ink-3" },
};

export function AlertRow({ a, onOpen, onDismiss, compact }: { a: Alert; onOpen: () => void; onDismiss?: () => void; compact?: boolean }) {
  const p = PRIORITY[a.priority];
  return (
    <div className="group flex items-start gap-3 py-3">
      <p.icon className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", p.cls)} aria-label={p.label} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="text-[14px] font-medium leading-snug text-ink">{a.title}</p>
        {!compact && <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{a.body}</p>}
      </button>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label={`Dismiss: ${a.title}`} className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-3 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function useAlertActions() {
  const router = useRouter();
  const { ds, today } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  return {
    open(a: Alert) {
      useUI.getState().setAlerts(false);
      if (a.eventKey) useUI.getState().openEvent(a.eventKey);
      else if (a.href) router.push(a.href);
    },
    dismiss(a: Alert) {
      void updatePrefs({ dismissedAlerts: { ...(ds.profile.preferences?.dismissedAlerts ?? {}), [a.key]: today } });
    },
  };
}

function inQuietHours(start?: string, end?: string): boolean {
  if (!start || !end) return false;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const toM = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const a = toM(start);
  const b = toM(end);
  return a <= b ? mins >= a && mins < b : mins >= a || mins < b;
}

/** Shows a daily browser notification for urgent alerts, if the user turned it on. */
function useDeviceNotifications() {
  const { alerts, ds, today } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const n = ds.profile.preferences?.notifications;
  useEffect(() => {
    if (!n?.browser || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (n.lastNotified === today || inQuietHours(n.quietStart, n.quietEnd)) return;
    const urgent = alerts.filter((a) => a.priority === "critical" || a.priority === "high");
    if (!urgent.length) return;
    try {
      if (n.digest !== false || urgent.length > 2) {
        new Notification(`Kosh: ${urgent.length} item${urgent.length > 1 ? "s" : ""} need attention`, { body: urgent.slice(0, 3).map((a) => a.title).join("\n"), tag: `kosh-${today}` });
      } else {
        for (const a of urgent) new Notification(a.title, { body: a.body, tag: a.key });
      }
      void updatePrefs({ notifications: { ...n, lastNotified: today } });
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }, [alerts, n, today, updatePrefs]);
}

export function AlertsPanel() {
  const open = useUI((s) => s.alerts);
  const { alerts, ds } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const actions = useAlertActions();
  useDeviceNotifications();
  const groups = (["critical", "high", "normal", "info"] as AlertPriority[]).map((p) => ({ p, items: alerts.filter((a) => a.priority === p) })).filter((g) => g.items.length);
  const notifOn = !!ds.profile.preferences?.notifications?.browser;
  const canNotify = typeof Notification !== "undefined";
  return (
    <Sheet
      open={open}
      onClose={() => useUI.getState().setAlerts(false)}
      title="Alerts"
      description="Bills due, projected shortfalls and other things that need you."
      footer={
        canNotify && !notifOn ? (
          <Button
            size="sm"
            icon={<BellRing className="h-4 w-4" />}
            onClick={async () => {
              const perm = await Notification.requestPermission();
              if (perm === "granted") await updatePrefs({ notifications: { ...(ds.profile.preferences?.notifications ?? {}), browser: true, digest: true } });
            }}
          >
            Notify me on this device
          </Button>
        ) : undefined
      }
    >
      {groups.length === 0 ? (
        <EmptyState title="You're all caught up" body="Nothing is overdue and your cash stays positive for the next 60 days." />
      ) : (
        groups.map((g) => (
          <section key={g.p} className="mb-2">
            <h3 className="pt-2 text-[12.5px] font-semibold text-ink-3">{PRIORITY[g.p].label}</h3>
            <div className="divide-y divide-line">
              {g.items.map((a) => (
                <AlertRow key={a.key} a={a} onOpen={() => actions.open(a)} onDismiss={() => actions.dismiss(a)} />
              ))}
            </div>
          </section>
        ))
      )}
    </Sheet>
  );
}
