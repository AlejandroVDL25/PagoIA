import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/app-url"

const EMAIL_OTP_TYPES: ReadonlyArray<EmailOtpType> = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as ReadonlyArray<string>).includes(value)
}

function loginWithError(origin: string, message: string): NextResponse {
  const url = new URL("/auth/login", origin)
  url.searchParams.set("error", message)
  return NextResponse.redirect(url)
}

/**
 * Regreso desde Supabase Auth: confirmación de correo, OAuth y enlaces de recuperación.
 * Admite el flujo PKCE (?code=) y el de plantilla con token (?token_hash=&type=).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const next = safeNextPath(searchParams.get("next"), type === "recovery" ? "/auth/reset-password" : "/dashboard")

  // Supabase regresa con ?error=...&error_description=... cuando el enlace venció o el proveedor falló.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error")
  if (providerError) {
    return loginWithError(origin, providerError)
  }

  try {
    const supabase = await createClient()

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error("[auth/callback] exchangeCodeForSession:", error.message)
        // El verificador PKCE vive en el navegador donde se pidió el registro; si el enlace
        // se abrió en otro dispositivo, el correo ya quedó confirmado y basta con iniciar sesión.
        if (/code verifier|code_verifier|both auth code and code verifier/i.test(error.message)) {
          return loginWithError(origin, "Abriste el enlace en otro navegador. Si ya confirmaste tu correo, inicia sesión aquí para continuar.")
        }
        return loginWithError(origin, error.message)
      }
    } else if (tokenHash && isEmailOtpType(type)) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      if (error) {
        console.error("[auth/callback] verifyOtp:", error.message)
        return loginWithError(origin, error.message)
      }
    } else {
      return loginWithError(origin, "El enlace de acceso no es válido o está incompleto.")
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error("[auth/callback] getUser:", userError?.message ?? "sin usuario")
      return loginWithError(origin, "No pudimos verificar tu sesión. Inicia sesión de nuevo.")
    }

    return NextResponse.redirect(new URL(next, origin))
  } catch (error) {
    console.error("[auth/callback] error inesperado:", error)
    return loginWithError(origin, "No pudimos completar el acceso. Intenta de nuevo.")
  }
}
