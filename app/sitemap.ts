import type { MetadataRoute } from "next"
import { getBaseUrl } from "@/lib/app-url"

/** Páginas públicas que Google puede indexar. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getBaseUrl()
  const lastModified = new Date()
  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/auth/register`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/auth/login`, lastModified, changeFrequency: "monthly", priority: 0.5 },
  ]
}
