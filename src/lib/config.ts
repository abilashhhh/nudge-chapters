export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Nudge Chapters";
export const TAGLINE = "Small nudges. Bigger chapters.";
/** Sub-path the app is served from, e.g. "/nudge-chapters" on GitHub Pages; empty at the domain root. */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
/** Public URL of the deployment (used for Open Graph links). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
/** Prefix a raw path with the base path. <Link> and router.push already do this; plain URLs (service worker, icons, auth redirects) don't. */
export const withBase = (path: string) => `${BASE_PATH}${path}`;
/** Absolute URL of an app route on the current origin, e.g. for Supabase auth redirects. */
export const appUrl = (path = "/") => `${window.location.origin}${BASE_PATH}${path}`;
export const BMC_USERNAME = (process.env.NEXT_PUBLIC_BMC_USERNAME || "").trim().replace(/^@/, "");
export const BMC_URL = BMC_USERNAME ? `https://buymeacoffee.com/${encodeURIComponent(BMC_USERNAME)}` : "";
export const BMC_FLOATING = process.env.NEXT_PUBLIC_BMC_WIDGET === "true";
export const GOOGLE_AUTH = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true";
export const IS_DEV = process.env.NODE_ENV === "development";
