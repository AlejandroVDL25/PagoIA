"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, resolveLocale, translate, type Locale } from "@/lib/i18n"
import { createClient, isSupabaseClientConfigured } from "@/lib/supabase/client"

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => Promise<void>
  t: (text: string | null | undefined) => string
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: async () => {},
  t: (text) => text ?? "",
})

const readStored = (): Locale | null => {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY)
    return v ? resolveLocale(v) : null
  } catch {
    return null
  }
}

/**
 * Idioma de avisos y notificaciones. Arranca en español de México; si la persona eligió otro idioma
 * se guarda en su cuenta (user_metadata.locale), así el servidor también le escribe en ese idioma.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    const stored = readStored()
    if (stored) setLocaleState(stored)
    if (!isSupabaseClientConfigured()) return
    // La cuenta manda: si se eligió el idioma en otro dispositivo, se respeta aquí.
    createClient()
      .auth.getUser()
      .then(({ data }: { data: { user: { user_metadata?: { locale?: string } } | null } }) => {
        const fromAccount = data.user?.user_metadata?.locale
        if (!fromAccount) return
        const resolved = resolveLocale(fromAccount)
        setLocaleState(resolved)
        try {
          localStorage.setItem(LOCALE_STORAGE_KEY, resolved)
        } catch {}
      })
      .catch(() => {})
  }, [])

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next)
    } catch {}
    if (!isSupabaseClientConfigured()) return
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    if (data.user) await supabase.auth.updateUser({ data: { locale: next } })
  }, [])

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale, t: (text) => translate(text, locale) }), [locale, setLocale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export const useLocale = () => useContext(LocaleContext)
