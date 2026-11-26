import type { CookieOptionsWithName } from '@supabase/ssr'

/**
 * Opciones comunes de las cookies de sesión de Supabase.
 * Path=/ y SameSite=Lax permiten que la sesión sobreviva al regreso desde Supabase/Google;
 * Secure solo fuera de desarrollo, porque localhost usa http.
 */
export const supabaseCookieOptions: CookieOptionsWithName = {
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV !== 'development',
}
