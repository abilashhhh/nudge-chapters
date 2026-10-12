"use client";

import { useEffect, useState } from "react";
import { isLoadError, recordCrash, reloadOnce } from "@/lib/recover";

/**
 * What you see if a screen crashes. A crash caused by an update (files of the old version no longer online)
 * just reloads; anything else shows a calm message with Reload / Home and is recorded so it can be fixed.
 */
export function CrashScreen({ error, retry, where }: { error: Error & { digest?: string }; retry?: () => void; where: string }) {
  const [recovering, setRecovering] = useState(() => isLoadError(error));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (isLoadError(error) && reloadOnce()) return;
    setRecovering(false);
    void recordCrash(error, where);
  }, [error, where]);

  const home = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/`;
  };
  const box: React.CSSProperties = { maxWidth: 420, margin: "0 auto", padding: "15vh 20px 40px", fontFamily: "system-ui, sans-serif" };
  if (recovering) {
    return (
      <div style={box} role="status">
        <p style={{ fontSize: 16, fontWeight: 600 }}>Updating to the latest version…</p>
      </div>
    );
  }
  return (
    <div style={box} role="alert">
      <p style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Something went wrong on this screen</p>
      <p style={{ fontSize: 14, opacity: 0.75, marginTop: 8 }}>Your data is safe — everything is saved as you go. Reloading usually fixes it.</p>
      <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
        <button type="button" onClick={() => window.location.reload()} style={{ height: 40, padding: "0 16px", borderRadius: 12, border: 0, background: "#1f6b4f", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          Reload
        </button>
        {retry && (
          <button type="button" onClick={retry} style={{ height: 40, padding: "0 16px", borderRadius: 12, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer", opacity: 0.85 }}>
            Try again
          </button>
        )}
        <button type="button" onClick={home} style={{ height: 40, padding: "0 16px", borderRadius: 12, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer", opacity: 0.85 }}>
          Go to Home
        </button>
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ marginTop: 20, background: "none", border: 0, padding: 0, color: "inherit", opacity: 0.6, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>
        {open ? "Hide details" : "Show details"}
      </button>
      {open && (
        <pre style={{ marginTop: 8, fontSize: 11.5, whiteSpace: "pre-wrap", wordBreak: "break-word", opacity: 0.75 }}>
          {`${error.name}: ${error.message}${error.digest ? `\n${error.digest}` : ""}`}
        </pre>
      )}
    </div>
  );
}
