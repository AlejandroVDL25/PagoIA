import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_LOCALE, resolveLocale, type Locale } from "@/lib/i18n"

/**
 * Idioma de avisos que eligió la persona (user_metadata.locale). Si no eligió o no se puede leer,
 * se usa el español de México.
 */
export async function getUserLocale(userId: string, admin?: SupabaseClient): Promise<Locale> {
  try {
    const client = admin ?? createAdminClient()
    const { data } = await client.auth.admin.getUserById(userId)
    return resolveLocale(data.user?.user_metadata?.locale)
  } catch {
    return DEFAULT_LOCALE
  }
}
