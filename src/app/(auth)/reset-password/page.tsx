"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { APP_NAME } from "@/lib/config";
import { getSupabase, supabaseConfigured } from "@/lib/data/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    const { error: e } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (e) return setError(e.message);
    toast.success("Password updated");
    router.replace("/");
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-5">
      <div className="display text-[30px] font-bold">{APP_NAME}</div>
      <h1 className="display text-[24px] font-semibold">Choose a new password</h1>
      {!supabaseConfigured ? (
        <p className="text-ink-2">Accounts aren&apos;t enabled for this copy of the app.</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="New password" htmlFor="pw">
            <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password" htmlFor="pw2" error={error}>
            <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy}>
            Save password
          </Button>
        </form>
      )}
    </main>
  );
}
