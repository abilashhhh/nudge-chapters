import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE_URL) return [];
  const now = new Date();
  return [
    { url: `${SITE_URL}/welcome/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/login/`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
