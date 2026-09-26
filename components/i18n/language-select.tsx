"use client"

import { Languages } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n"
import { useLocale } from "@/components/i18n/locale-provider"
import { cn } from "@/lib/utils"

/** Selector del idioma de avisos y notificaciones (español de México por defecto). */
export function LanguageSelect({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { locale, setLocale } = useLocale()
  return (
    <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
      <SelectTrigger className={cn(compact ? "h-9 w-44" : "w-full sm:w-64", className)} aria-label="Idioma de avisos · Language · Sprache">
        <Languages className="mr-2 h-4 w-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((l) => (
          <SelectItem key={l} value={l}>
            {LOCALE_LABELS[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
