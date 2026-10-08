"use client";

import { Mail, Sparkles, Smartphone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { setLocalMode } from "@/components/shell/bootstrap";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { Brand } from "@/components/brand";
import { APP_NAME, GOOGLE_AUTH, appUrl } from "@/lib/config";
import { LocalRepo } from "@/lib/data/localRepo";
import { getSupabase, supabaseConfigured } from "@/lib/data/supabase";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null);
  const [code, setCode] = useState("");

  // Already signed in? Go straight to the app (or the 2FA step).
  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    void (async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) return;
      const ok = await checkMfa();
      if (ok) router.replace(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkMfa(): Promise<boolean> {
    const sb = getSupabase();
    const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.data && aal.data.nextLevel === "aal2" && aal.data.currentLevel !== "aal2") {
      const factors = await sb.auth.mfa.listFactors();
      const totp = factors.data?.totp?.find((f) => f.status === "verified");
      if (totp) {
        setMfa({ factorId: totp.id });
        return false;
      }
    }
    return true;
  }

  const enterApp = () => {
    setLocalMode(null);
    useStore.getState().setRepo(null);
    router.replace(next);
  };

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy("password");
    const sb = getSupabase();
    try {
      if (mode === "signup") {
        const { data, error: e } = await sb.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim() || undefined }, emailRedirectTo: appUrl("/") },
        });
        if (e) throw e;
        if (!data.session) {
          setInfo("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
          return;
        }
        enterApp();
      } else {
        const { error: e } = await sb.auth.signInWithPassword({ email, password });
        if (e) throw e;
        if (await checkMfa()) enterApp();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const magicLink = async () => {
    setError(null);
    if (!email.includes("@")) return setError("Enter your email address first.");
    setBusy("magic");
    const { error: e } = await getSupabase().auth.signInWithOtp({ email, options: { emailRedirectTo: appUrl("/") } });
    setBusy(null);
    if (e) setError(e.message);
    else setInfo(`We sent a sign-in link to ${email}.`);
  };

  const forgot = async () => {
    setError(null);
    if (!email.includes("@")) return setError("Enter your email address first.");
    setBusy("forgot");
    const { error: e } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: appUrl("/reset-password/") });
    setBusy(null);
    if (e) setError(e.message);
    else setInfo("If that email has an account, a reset link is on its way.");
  };

  const google = async () => {
    setBusy("google");
    const { error: e } = await getSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: appUrl("/") } });
    if (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  const verifyMfa = async () => {
    if (!mfa) return;
    setBusy("mfa");
    setError(null);
    const { error: e } = await getSupabase().auth.mfa.challengeAndVerify({ factorId: mfa.factorId, code: code.trim() });
    setBusy(null);
    if (e) setError("That code didn't work. Check your authenticator app and try again.");
    else enterApp();
  };

  const startLocal = (seed: "demo" | "empty") => {
    LocalRepo.clear();
    setLocalMode("local");
    const repo = new LocalRepo(seed);
    useStore.getState().setRepo(repo);
    void useStore.getState().load();
    toast.success(seed === "demo" ? "Loaded sample data — explore freely." : "Your data stays on this device.");
    router.replace(seed === "demo" ? "/" : "/onboarding");
  };

  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative hidden overflow-hidden bg-[#13241d] p-12 text-[#e6ede9] lg:flex lg:flex-col">
        <Brand size="lg" tagline taglineClassName="text-[#b8c6bf]" />
        <div className="mt-auto max-w-lg">
          <h1 className="display text-[44px] font-semibold leading-[1.05]">
            What will you have on 31&nbsp;December&nbsp;2027?
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-[#b8c6bf]">
            Salary, rent, card bills, EMIs, SIPs, EPF, chits and money you&apos;ve lent — on one timeline. Nudge Chapters shows today&apos;s position and projects it forward,
            with every number explained.
          </p>
          <ProjectionSketch />
        </div>
      </section>

      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <Brand size="lg" tagline className="mb-8 lg:hidden" />
          {mfa ? (
            <div className="flex flex-col gap-4">
              <h2 className="display text-[26px] font-semibold">Two-step verification</h2>
              <p className="text-[14px] text-ink-2">Enter the 6-digit code from your authenticator app.</p>
              <Field label="Code" htmlFor="mfa-code" error={error}>
                <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
              </Field>
              <Button variant="primary" size="lg" loading={busy === "mfa"} onClick={verifyMfa} icon={<Smartphone className="h-4 w-4" />}>
                Verify
              </Button>
            </div>
          ) : supabaseConfigured ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <h2 className="display text-[26px] font-semibold">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
              <Segmented
                options={[
                  { id: "signin", label: "Sign in" },
                  { id: "signup", label: "Create account" },
                ]}
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setError(null);
                }}
              />
              {mode === "signup" && (
                <Field label="Your name" htmlFor="name" optional>
                  <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
              )}
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Password" htmlFor="password" help={mode === "signup" ? "At least 8 characters." : undefined}>
                <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {error && (
                <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13.5px] text-danger" role="alert">
                  {error}
                </p>
              )}
              {info && <p className="rounded-xl bg-ok-soft px-3 py-2 text-[13.5px] text-ok">{info}</p>}
              <Button type="submit" variant="primary" size="lg" loading={busy === "password"}>
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
              {mode === "signin" && (
                <div className="flex items-center justify-between text-[13.5px]">
                  <button type="button" onClick={magicLink} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink" disabled={busy === "magic"}>
                    <Mail className="h-4 w-4" /> Email me a sign-in link
                  </button>
                  <button type="button" onClick={forgot} className="text-ink-2 hover:text-ink">
                    Forgot password?
                  </button>
                </div>
              )}
              {GOOGLE_AUTH && (
                <Button size="lg" onClick={google} loading={busy === "google"}>
                  Continue with Google
                </Button>
              )}
            </form>
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-4 text-[13.5px] text-ink-2">
              Sign-in isn&apos;t available right now. You can still use {APP_NAME} on this device below.
            </div>
          )}

          <div className="my-7 flex items-center gap-3 text-[12.5px] text-ink-3">
            <span className="h-px flex-1 bg-line" />
            or try it first
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="flex flex-col gap-2">
            <Button size="lg" icon={<Sparkles className="h-4 w-4 text-future" />} onClick={() => startLocal("demo")}>
              Explore with sample data
            </Button>
            <Button variant="ghost" onClick={() => startLocal("empty")}>
              Use without an account (this device only)
            </Button>
          </div>
          <p className="mt-6 text-[12px] leading-relaxed text-ink-3">
            Nudge Chapters never asks for bank passwords. Your data is private to your account, and device-only data never leaves this browser.
          </p>
        </div>
      </main>
    </div>
  );
}

/** A small illustration of the product's idea: a solid past line that turns into a dashed, violet projection. */
function ProjectionSketch() {
  return (
    <svg viewBox="0 0 480 160" className="mt-10 w-full" aria-hidden>
      <line x1="0" y1="140" x2="480" y2="140" stroke="#2b3d35" strokeWidth="1" />
      <line x1="250" y1="10" x2="250" y2="140" stroke="#3d5248" strokeWidth="1" />
      <text x="256" y="22" fill="#8fa49a" fontSize="12" fontFamily="var(--font-sans)">
        today
      </text>
      <path d="M0 120 C40 118 60 104 90 108 S150 92 180 96 S230 80 250 78" fill="none" stroke="#4cbf8e" strokeWidth="3" strokeLinecap="round" />
      <path d="M250 78 C290 70 320 62 360 52 S430 32 480 20" fill="none" stroke="#a593ff" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" />
      <path d="M250 78 C290 76 330 72 370 70 S440 62 480 58" fill="none" stroke="#a593ff" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="2 9" />
      <circle cx="250" cy="78" r="6" fill="#13241d" stroke="#4cbf8e" strokeWidth="3" />
    </svg>
  );
}
