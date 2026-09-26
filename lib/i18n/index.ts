import { EXACT, FRAGMENTS, PATTERNS, type Entry } from "./catalog"

/**
 * Idiomas de avisos y notificaciones. PagoIA opera solo en México: el español de México es el
 * idioma principal y el de respaldo; inglés (EE. UU.) y alemán son opcionales por usuario.
 */
export const LOCALES = ["es-MX", "en-US", "de-DE"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "es-MX"
export const LOCALE_STORAGE_KEY = "pagoia-locale"

export const LOCALE_LABELS: Record<Locale, string> = {
  "es-MX": "Español (México)",
  "en-US": "English (US)",
  "de-DE": "Deutsch",
}

export function resolveLocale(value: unknown): Locale {
  if (typeof value !== "string") return DEFAULT_LOCALE
  const v = value.toLowerCase()
  if (v.startsWith("en")) return "en-US"
  if (v.startsWith("de")) return "de-DE"
  return DEFAULT_LOCALE
}

type Lang = "es" | "en" | "de"
const langOf = (locale: Locale): Lang => (locale === "en-US" ? "en" : locale === "de-DE" ? "de" : "es")
const pick = (entry: Entry, key: string, lang: Lang) => (lang === "es" ? (entry.es ?? key) : entry[lang])

const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
}

/** "12 de octubre de 2026" → "October 12, 2026" / "12. Oktober 2026". */
function translateDates(text: string, lang: Lang) {
  if (lang === "es") return text
  return text.replace(/(\d{1,2}) de ([a-záéíóú]+)(?: de (\d{4}))?/gi, (full, day: string, month: string, year?: string) => {
    const i = MONTHS_ES.indexOf(month.toLowerCase())
    if (i < 0) return full
    const name = MONTHS[lang][i]
    return lang === "en" ? `${name} ${day}${year ? `, ${year}` : ""}` : `${day}. ${name}${year ? ` ${year}` : ""}`
  })
}

function translateFragment(text: string, lang: Lang) {
  const f = FRAGMENTS[text]
  if (f) return pick(f, text, lang)
  return translateDates(text, lang)
}

// Emojis o símbolos al inicio ("✅ Servicio agregado"): se conservan y se traduce el resto.
const PREFIX = /^((?:\p{Extended_Pictographic}|️|‍|\s)+)/u

function translateOne(text: string, lang: Lang): string | null {
  const exact = EXACT[text]
  if (exact) return pick(exact, text, lang)
  // Palabras sueltas (p. ej. el nombre del servicio en un parámetro de WhatsApp).
  if (lang !== "es" && FRAGMENTS[text]) return pick(FRAGMENTS[text], text, lang)

  const prefix = text.match(PREFIX)?.[1] ?? ""
  if (prefix) {
    const rest = text.slice(prefix.length)
    const restExact = EXACT[rest]
    if (restExact) return prefix + pick(restExact, rest, lang)
  }

  if (lang === "es") return null
  for (const p of PATTERNS) {
    const m = text.match(p.re)
    // Un dato nunca abarca dos oraciones; si pasa, el mensaje se traduce oración por oración.
    if (!m || m.slice(1).some((g) => g && /[.!?]\s/.test(g))) continue
    return p[lang].replace(/\$(\d)/g, (_, n: string) => translateFragment(m[Number(n)] ?? "", lang))
  }
  return null
}

/**
 * Traduce un aviso escrito en español de México al idioma del usuario. Si no hay traducción,
 * devuelve el texto en español: nunca deja al usuario sin mensaje.
 */
export function translate(text: string | null | undefined, locale: Locale): string {
  if (!text) return text ?? ""
  const lang = langOf(locale)
  const whole = translateOne(text.trim(), lang)
  if (whole !== null) return whole
  if (lang === "es") return text

  // Mensajes de varias oraciones: se busca el tramo más largo de oraciones seguidas que tenga
  // traducción (hay frases de dos oraciones en el catálogo) y se conservan los saltos de línea.
  const parts = text.split(/(?<=[.!?])(\s+)/) // [oración, separador, oración, …]
  const out: string[] = []
  let i = 0
  while (i < parts.length) {
    let done = false
    for (let j = parts.length - 1; j >= i; j -= 2) {
      const chunk = parts.slice(i, j + 1).join("")
      const t = translateOne(chunk, lang)
      if (t !== null) {
        out.push(t, parts[j + 1] ?? "")
        i = j + 2
        done = true
        break
      }
    }
    if (!done) {
      out.push(translateDates(parts[i], lang), parts[i + 1] ?? "")
      i += 2
    }
  }
  return out.join("")
}

/** Idioma de WhatsApp (código de la plantilla aprobada en Meta) para cada idioma de PagoIA. */
export function whatsappLanguage(locale: Locale) {
  if (locale === "en-US") return process.env.WHATSAPP_TEMPLATE_LANG_EN || "en_US"
  if (locale === "de-DE") return process.env.WHATSAPP_TEMPLATE_LANG_DE || "de"
  return process.env.WHATSAPP_TEMPLATE_LANG || "es_MX"
}
