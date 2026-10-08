import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ServiceWorker } from "@/components/shell/service-worker";
import { APP_NAME, SITE_URL, TAGLINE, withBase } from "@/lib/config";
import "./globals.css";

const DESCRIPTION =
  "Nudge Chapters is a personal command centre for your money: cash flow, bills, cards, EMIs, investments, EPF, chits and lending on one timeline, with timely nudges and a clear view of any future date.";

export const metadata: Metadata = {
  ...(SITE_URL ? { metadataBase: new URL(`${SITE_URL}/`) } : {}),
  title: { default: `${APP_NAME} — ${TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: DESCRIPTION,
  manifest: withBase("/manifest.webmanifest"),
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  icons: {
    icon: [
      { url: withBase("/icon.svg"), type: "image/svg+xml" },
      { url: withBase("/favicon-32.png"), sizes: "32x32", type: "image/png" },
      { url: withBase("/icon-192.png"), sizes: "192x192", type: "image/png" },
    ],
    apple: withBase("/apple-touch-icon.png"),
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
    locale: "en_IN",
    // Resolved against metadataBase (which already includes the base path), so no withBase here.
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${APP_NAME} — ${TAGLINE}` }],
  },
  twitter: { card: "summary_large_image", title: `${APP_NAME} — ${TAGLINE}`, description: DESCRIPTION, images: ["/og.png"] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1210" },
  ],
};

// Runs before first paint: moves storage keys from the app's earlier name ("kosh…" → "nudge…") so
// existing device data and sign-ins carry over, then applies the saved theme to avoid a flash.
const themeScript = `try{var s=localStorage;for(var i=s.length-1;i>=0;i--){var k=s.key(i);if(k&&k.indexOf('kosh')===0){var n='nudge'+k.slice(4);if(s.getItem(n)===null)s.setItem(n,s.getItem(k));s.removeItem(k);}}var t=s.getItem('nudge:theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
        <ServiceWorker />
      </body>
    </html>
  );
}
