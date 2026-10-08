import type { NextConfig } from "next";

/**
 * Two ways to run this app:
 *  - `npm run build && npm start` — a Node server (Vercel, Netlify, any VPS). Security headers are sent.
 *  - `npm run build:static` — a fully static site in `out/` for GitHub Pages / Cloudflare Pages / any CDN.
 *    Set NEXT_PUBLIC_BASE_PATH (e.g. "/nudge-chapters") when the site is served from a sub-path.
 * The app is entirely client-rendered (data comes from Supabase in the browser), so both modes behave the same.
 */
const STATIC_EXPORT = process.env.NEXT_OUTPUT === "export";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // "/cash-flow/" → cash-flow/index.html, which static hosts serve without rewrites.
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
  ...(STATIC_EXPORT
    ? { output: "export" as const, images: { unoptimized: true } }
    : {
        async headers() {
          return [{ source: "/(.*)", headers: securityHeaders }];
        },
      }),
};

export default nextConfig;
