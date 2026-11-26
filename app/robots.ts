import type { MetadataRoute } from "next"
import { getBaseUrl } from "@/lib/app-url"

/** Reglas para buscadores: solo se indexan las páginas públicas; el panel y la API son privados. */
export default function robots(): MetadataRoute.Robots {
  const base = getBaseUrl()
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/auth/login", "/auth/register"],
        disallow: ["/dashboard", "/admin", "/api/", "/auth/callback", "/auth/reset-password", "/auth/forgot-password"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
