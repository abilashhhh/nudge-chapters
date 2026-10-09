"use client";

import { Fingerprint, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { biometricAvailable, checkPin, makeLock, readLock, registerBiometric, writeLock, type LockConfig } from "@/lib/lock";
import { useFinance } from "@/lib/finance";
import { useStore } from "@/lib/store";
import type { Preferences } from "@/lib/types";
import { AmountInput, Field, Input, Select, Switch } from "./ui/form";
import { Button } from "./ui/button";
import { Panel, Segmented } from "./ui/misc";

// ---------------------------------------------------------------------------
// App lock

export function AppLockSettings() {
  const { ds } = useFinance();
  const [cfg, setCfg] = useState<LockConfig | null>(null);
  const [bioOk, setBioOk] = useState(false);
  const [mode, setMode] = useState<"idle" | "set" | "change" | "off">("idle");
  const [cur, setCur] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  useEffect(() => {
    setCfg(readLock());
    // Checked up front so setting a PIN can register Face ID within the same tap.
    void biometricAvailable().then(setBioOk);
  }, []);
  const reset = () => {
    setMode("idle");
    setCur("");
    setPin("");
    setPin2("");
  };
  const valid = /^\d{4,6}$/.test(pin) && pin === pin2;

  const save = async () => {
    if (mode === "change" || mode === "off") {
      if (!cfg || !(await checkPin(cur, cfg))) return toast.error("Current PIN is wrong");
    }
    if (mode === "off") {
      writeLock(null);
      setCfg(null);
      toast.success("App lock is off");
      return reset();
    }
    if (!valid) return toast.error("Use 4–6 digits, entered the same twice");
    // Face ID / fingerprint is on by default: set it up in the same tap (browsers only allow it right after a tap).
    let credId = cfg?.credId ?? null;
    if (mode === "set" && bioOk && !credId) {
      try {
        credId = await registerBiometric(ds.profile.name ?? "me");
      } catch {
        toast.message("Face ID wasn't set up — you can turn it on below. Your PIN works meanwhile.");
      }
    }
    const next = { ...(await makeLock(pin, cfg)), credId };
    writeLock(next);
    setCfg(next);
    toast.success(mode === "set" ? (credId ? "App lock is on — Face ID unlocks it 🔒" : "App lock is on 🔒") : "PIN changed");
    reset();
  };
  const toggleBio = async (on: boolean) => {
    if (!cfg) return;
    try {
      const credId = on ? await registerBiometric(ds.profile.name ?? "me") : null;
      const next = { ...cfg, credId };
      writeLock(next);
      setCfg(next);
      toast.success(on ? "Biometric unlock is on" : "Biometric unlock is off");
    } catch {
      toast.error("Biometric setup didn't complete");
    }
  };
  const setAuto = (min: number) => {
    if (!cfg) return;
    const next = { ...cfg, autoLockMin: min };
    writeLock(next);
    setCfg(next);
  };

  return (
    <Panel title={<span className="flex items-center gap-2"><Lock className="h-4 w-4" /> App lock</span>} description="Protect this device with a PIN, and Face ID or fingerprint where supported. The PIN is stored only as a salted hash on this device; biometric data never reaches the app.">
      {cfg ? (
        <div className="flex flex-col gap-4">
          <p className="text-[13.5px] text-ok">On for this device.</p>
          <Switch
            checked={!!cfg.credId}
            onChange={toggleBio}
            label={<span className="inline-flex items-center gap-1.5"><Fingerprint className="h-4 w-4" /> Unlock with Face ID / fingerprint</span>}
            help={bioOk ? "Uses your device's built-in authenticator. Your PIN always works as a fallback." : "Not available on this device or browser — the PIN is used instead."}
          />
          <Field label="Lock automatically" htmlFor="al-auto">
            <Select id="al-auto" value={String(cfg.autoLockMin)} onChange={(e) => setAuto(Number(e.target.value))}>
              <option value="0">Every time I open the app</option>
              <option value="1">After 1 minute</option>
              <option value="5">After 5 minutes</option>
              <option value="15">After 15 minutes</option>
              <option value="60">After 1 hour</option>
            </Select>
          </Field>
          {mode === "idle" ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setMode("change")}>Change PIN</Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("off")}>Turn off</Button>
            </div>
          ) : (
            <PinForm mode={mode} cur={cur} setCur={setCur} pin={pin} setPin={setPin} pin2={pin2} setPin2={setPin2} onSave={save} onCancel={reset} />
          )}
        </div>
      ) : mode === "set" ? (
        <PinForm mode="set" cur={cur} setCur={setCur} pin={pin} setPin={setPin} pin2={pin2} setPin2={setPin2} onSave={save} onCancel={reset} />
      ) : (
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={() => setMode("set")}>{bioOk ? "Turn on Face ID lock" : "Set a PIN"}</Button>
          {bioOk && <p className="text-[12.5px] text-ink-3">You&apos;ll choose a backup PIN, then Face ID is used to unlock. It won&apos;t ask again while you&apos;re using the app, or if you come back within the auto-lock time.</p>}
        </div>
      )}
    </Panel>
  );
}

function PinForm(p: {
  mode: "set" | "change" | "off";
  cur: string; setCur(v: string): void; pin: string; setPin(v: string): void; pin2: string; setPin2(v: string): void;
  onSave(): void; onCancel(): void;
}) {
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); p.onSave(); }}>
      {p.mode !== "set" && (
        <Field label="Current PIN" htmlFor="pin-cur">
          <Input id="pin-cur" type="password" inputMode="numeric" autoComplete="off" value={p.cur} onChange={(e) => p.setCur(digits(e.target.value))} />
        </Field>
      )}
      {p.mode !== "off" && (
        <>
          <Field label="New PIN (4–6 digits)" htmlFor="pin-new">
            <Input id="pin-new" type="password" inputMode="numeric" autoComplete="off" value={p.pin} onChange={(e) => p.setPin(digits(e.target.value))} />
          </Field>
          <Field label="Repeat PIN" htmlFor="pin-new2">
            <Input id="pin-new2" type="password" inputMode="numeric" autoComplete="off" value={p.pin2} onChange={(e) => p.setPin2(digits(e.target.value))} />
          </Field>
        </>
      )}
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" size="sm" variant={p.mode === "off" ? "danger" : "primary"}>
          {p.mode === "off" ? "Turn off lock" : "Save PIN"}
        </Button>
        <Button size="sm" variant="ghost" onClick={p.onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sections & widgets

export const SECTIONS: { id: string; label: string }[] = [
  { id: "dashboard", label: "Money dashboard" },
  { id: "transactions", label: "Cash flow & transactions" },
  { id: "budgets", label: "Budgets" },
  { id: "goals", label: "Goals (Chapters)" },
  { id: "bills", label: "Bills calendar" },
  { id: "credit_cards", label: "Credit cards, loans & chits" },
  { id: "investments", label: "Assets, investments & savings" },
  { id: "projections", label: "Future projections" },
  { id: "reports", label: "Reports & analytics" },
  { id: "tasks", label: "Tasks & plan" },
  { id: "reimbursements", label: "Owed to you (reimbursements)" },
];

export const HIDEABLE_WIDGETS: { id: string; label: string }[] = [
  { id: "hero", label: "Safe to spend & key numbers" },
  { id: "ribbon", label: "Future date projection" },
  { id: "upcoming", label: "Upcoming bills" },
  { id: "income", label: "Upcoming income" },
  { id: "alerts", label: "Alerts" },
  { id: "cashflow", label: "Cash flow chart" },
  { id: "networth", label: "Net worth chart" },
  { id: "goals", label: "Goals" },
  { id: "budgets", label: "Budgets" },
  { id: "timeline", label: "Next 90 days" },
  { id: "investments", label: "Investments" },
];

export function SectionSettings() {
  const { ds } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const hidden = ds.profile.preferences?.hidden ?? {};
  const toggle = (key: "sections" | "widgets", id: string, show: boolean) => {
    const list = new Set(hidden[key] ?? []);
    if (show) list.delete(id);
    else list.add(id);
    void updatePrefs({ hidden: { ...hidden, [key]: [...list] } });
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Sections" description="Hide sections you don't use. Hiding never deletes data — bills, EMIs, goals and chits in a hidden section still count in every calculation.">
        <div className="flex flex-col gap-3">
          {SECTIONS.map((s) => (
            <Switch key={s.id} checked={!(hidden.sections ?? []).includes(s.id)} onChange={(v) => toggle("sections", s.id, v)} label={s.label} />
          ))}
        </div>
      </Panel>
      <Panel title="Dashboard widgets" description="Show or hide individual cards on the Money dashboard. You can also reorder them from the dashboard's Customise button.">
        <div className="flex flex-col gap-3">
          {HIDEABLE_WIDGETS.map((w) => (
            <Switch key={w.id} checked={!(hidden.widgets ?? []).includes(w.id)} onChange={(v) => toggle("widgets", w.id, v)} label={w.label} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons, animation and planning preferences

export function VisualSettings() {
  const { ds, ctx } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const v = ds.profile.preferences?.visual ?? {};
  const set = (patch: NonNullable<Preferences["visual"]>) => void updatePrefs({ visual: { ...v, ...patch } });
  return (
    <>
      <Panel title="Icons & animations" description="Presentation only — none of these change your numbers.">
        <div className="flex flex-col gap-3">
          <Switch checked={v.emoji ?? true} onChange={(x) => set({ emoji: x })} label="Show emojis" />
          <Switch checked={v.celebrations ?? true} onChange={(x) => set({ celebrations: x })} label="Celebrate milestones" help="A short celebration when you complete a goal or a task." />
          <Switch checked={v.spendIcons ?? true} onChange={(x) => set({ spendIcons: x })} label="Budget mood icons" help="🙂 within budget, ⚠️ getting close, 😟 over." />
          <Field label="Animations" htmlFor="vs-motion">
            <Segmented
              options={[
                { id: "full", label: "Full" },
                { id: "subtle", label: "Subtle" },
                { id: "off", label: "Off" },
              ]}
              value={v.motion ?? "full"}
              onChange={(m) => set({ motion: m as "full" | "subtle" | "off" })}
            />
          </Field>
          <p className="text-[12px] text-ink-3">Your device&apos;s &ldquo;reduce motion&rdquo; setting is always respected.</p>
        </div>
      </Panel>
      <Panel title="Planning & alerts" description="Used by the goal plan, the balance forecast and the card planner.">
        <div className="flex flex-col gap-3">
          <Field label="Cash buffer to keep untouched" htmlFor="vs-buffer" help="Kept aside before any money is suggested for goals.">
            <AmountInput id="vs-buffer" value={ds.profile.preferences?.cashBuffer ?? null} onChange={(x) => void updatePrefs({ cashBuffer: x ?? 0 })} currency={ctx.currency} />
          </Field>
          <Field label="Low-balance alert" htmlFor="vs-low" help="The balance forecast warns before your available cash would drop below this.">
            <AmountInput id="vs-low" value={ds.profile.preferences?.lowBalance ?? null} onChange={(x) => void updatePrefs({ lowBalance: x ?? 0 })} currency={ctx.currency} />
          </Field>
          <Field label="Card utilisation alert (%)" htmlFor="vs-util">
            <Input id="vs-util" type="number" min={1} max={100} value={ds.profile.preferences?.utilAlert ?? 30} onChange={(e) => void updatePrefs({ utilAlert: Number(e.target.value) || 30 })} />
          </Field>
        </div>
      </Panel>
    </>
  );
}
