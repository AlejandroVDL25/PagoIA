import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthCallbackUrl } from "@/lib/app-url"

type AuthSettings = {
  external?: Record<string, boolean | undefined>
}

function isAuthSettings(value: unknown): value is AuthSettings {
  return typeof value === "object" && value !== null
}

/**
 * Consulta en vivo a Supabase si el proveedor OAuth está habilitado.
 * signInWithOAuth redirige sin validar, y si el proveedor está apagado el usuario
 * termina viendo un JSON de error de Supabase en lugar de un mensaje en la app.
 */
async function isProviderEnabled(provider: string): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      cache: "no-store",
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    if (!isAuthSettings(body) || !body.external) return null
    return body.external[provider] === true
  } catch {
    return null
  }
}

/** Inicia el acceso con Google. Devuelve un mensaje de error para mostrar o null si ya redirigió. */
export async function startGoogleSignIn(supabase: SupabaseClient): Promise<string | null> {
  const enabled = await isProviderEnabled("google")
  if (enabled === false) {
    return "El acceso con Google aún no está habilitado. Regístrate o inicia sesión con tu correo y contraseña."
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: getAuthCallbackUrl() },
  })

  return error ? error.message : null
}
