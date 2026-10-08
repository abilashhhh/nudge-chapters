export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Kosh";
export const BMC_USERNAME = (process.env.NEXT_PUBLIC_BMC_USERNAME || "").trim().replace(/^@/, "");
export const BMC_URL = BMC_USERNAME ? `https://buymeacoffee.com/${encodeURIComponent(BMC_USERNAME)}` : "";
export const BMC_FLOATING = process.env.NEXT_PUBLIC_BMC_WIDGET === "true";
export const GOOGLE_AUTH = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true";
export const IS_DEV = process.env.NODE_ENV === "development";
