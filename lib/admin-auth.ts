import type { User } from "@supabase/supabase-js"

/** Correos con acceso al panel administrativo, separados por comas en ADMIN_EMAILS (solo servidor). */
function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Un usuario es administrador solo si su correo confirmado está en ADMIN_EMAILS. */
export function isAdminUser(user: Pick<User, "email" | "email_confirmed_at"> | null | undefined): boolean {
  if (!user?.email || !user.email_confirmed_at) return false
  return adminEmails().has(user.email.toLowerCase())
}
