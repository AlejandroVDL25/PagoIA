import type { NextRequest } from "next/server"

const LOCAL_DEV_URL = "http://localhost:3000"

function normalize(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "")
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim()) return value
  }
  return undefined
}

/**
 * URL pública de PagoIA, sin "/" final. Funciona en servidor y en navegador.
 *
 * Orden de prioridad:
 * 0. En vistas previas de Vercel, el dominio de esa vista previa.
 * 1. NEXT_PUBLIC_SITE_URL (o NEXT_PUBLIC_APP_URL, el nombre anterior), salvo en desarrollo local.
 * 2. VERCEL_PROJECT_PRODUCTION_URL / NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL con https://.
 * 3. En el navegador, el origen de la página actual.
 * 4. http://localhost:3000 solo cuando NODE_ENV === "development".
 */
export function getBaseUrl(): string {
  const isDev = process.env.NODE_ENV === "development"

  if (isDev) {
    if (typeof window !== "undefined") return window.location.origin
    return LOCAL_DEV_URL
  }

  // En despliegues de vista previa de Vercel la cookie PKCE vive en el dominio de la vista previa,
  // así que el regreso de Supabase debe ser a ese mismo dominio y no al de producción.
  const vercelEnv = firstDefined(process.env.NEXT_PUBLIC_VERCEL_ENV, process.env.VERCEL_ENV)
  if (vercelEnv === "preview") {
    if (typeof window !== "undefined") return window.location.origin
    if (process.env.VERCEL_URL) return normalize(process.env.VERCEL_URL)
  }

  const configured = firstDefined(process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL)
  if (configured) return normalize(configured)

  const vercelProduction = firstDefined(
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
  )
  if (vercelProduction) return normalize(vercelProduction)

  if (typeof window !== "undefined") return window.location.origin

  const vercelDeployment = process.env.VERCEL_URL
  if (vercelDeployment) return normalize(vercelDeployment)

  return LOCAL_DEV_URL
}

/**
 * Igual que getBaseUrl(), pero en desarrollo usa el host de la petición
 * (útil si se abre la app desde otro equipo de la red o un túnel).
 */
export function resolveBaseUrl(req: NextRequest): string {
  if (process.env.NODE_ENV === "development") {
    const forwardedHost = req.headers.get("x-forwarded-host")
    if (forwardedHost) return `${req.headers.get("x-forwarded-proto") || "http"}://${forwardedHost}`
    return req.nextUrl.origin
  }
  return getBaseUrl()
}

/** URL a la que Supabase debe regresar después de confirmar correo u OAuth. */
export function getAuthCallbackUrl(next?: string): string {
  const url = new URL("/auth/callback", getBaseUrl())
  if (next) url.searchParams.set("next", next)
  return url.toString()
}

/** Acepta solo rutas internas ("/dashboard/..."); evita redirecciones abiertas a otros dominios. */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback
  return next
}
