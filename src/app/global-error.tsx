"use client";

import { CrashScreen } from "@/components/shell/crash-screen";

/** Last-resort screen if the whole app fails (replaces Next.js's "This page couldn't load"). */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry?: () => void }) {
  return (
    <html lang="en-IN">
      <head>
        <title>Nudge Chapters</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`html{color-scheme:light dark}body{margin:0;background:#eef1ec;color:#15201c}@media (prefers-color-scheme:dark){body{background:#0d1210;color:#e6ede9}}`}</style>
      </head>
      <body>
        <CrashScreen error={error} retry={retry} where="global" />
      </body>
    </html>
  );
}
