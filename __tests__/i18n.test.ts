import { describe, it, expect } from 'vitest'
import { translate, resolveLocale } from '@/lib/i18n'
import { EXACT } from '@/lib/i18n/catalog'

// Mensajes tal como los arma el servidor (webhook, cron, pagos automáticos, recordatorios).
const SERVER_MESSAGES = [
  '✅ Pago de Luz completado',
  'Se procesó un pago de $486.00 MXN a CFE. Transacción: A3F9C21B. Descarga tu comprobante desde Historial.',
  'Ficha OXXO lista: Agua',
  'Paga $238.00 MXN en cualquier OXXO en los próximos 3 días. Te avisaremos cuando se confirme el pago.',
  '✅ Pago de Gas confirmado',
  'OXXO confirmó tu pago de $410.00 MXN. Descarga tu comprobante desde Historial.',
  'La ficha OXXO de Gas venció',
  'No se registró el pago de $410.00 MXN. Puedes generar una ficha nueva desde Mis Pagos.',
  'Se ha reportado una disputa para el cargo ch_123. El monto en disputa es $100.00 MXN. Revisaremos el caso dentro de 7-10 días hábiles.',
  'Se solicitó un reembolso por $50.00 MXN para electricity. Stripe lo está procesando con estado pending.',
  'Vence hoy: CFE',
  'Vence en 1 día: CFE',
  'Vence en 3 días: SACMEX',
  'Tu servicio CFE vence el 12 de octubre de 2026. Último monto registrado: $486.00 MXN.',
  'Tu recibo de luz vence mañana',
  'Tu recibo de agua vence en 3 días',
  'CFE vence el 12 de octubre. Monto aproximado: $486.00.',
  'Tu servicio vence el 12 de octubre.',
  'Tu recibo de agua salió más alto de lo normal',
  'Este periodo pagaste $310.00, 22% más de lo esperado. Revisa si hubo una fuga, un cobro extra o un cambio de tarifa.',
  'Rebasaste tu presupuesto de luz',
  'Vas en 85% de tu presupuesto de gas',
  'Llevas $850.00 de $1,000.00 este mes.',
  'No cobramos tu recibo de luz',
  'El recibo es de $950.00 y tu tope es de $800.00. Págalo tú o sube el tope en Pagos automáticos.',
  'Tu pago automático no tiene tarjeta',
  'Guarda una tarjeta en Pagos automáticos para cobrar tu recibo de luz (CFE).',
  'No se pudo cobrar tu recibo de luz',
  'Tu banco rechazó el cargo. Revisa tu saldo o cambia de tarjeta. Monto: $486.00.',
  '✅ Pagamos tu recibo de luz',
  'Cobramos $486.00 a tu tarjeta visa •••• 4242. El comprobante está en Historial.',
  'Pago completado',
  'Esta es una prueba de notificaciones push de PagoIA.',
]

// Palabras que solo aparecen si una oración se quedó sin traducir.
const SPANISH = /\b(Tu|tu|recibo|Pago|pago|vence|Vence|presupuesto|cobramos|Cobramos|Descarga|comprobante|Revisa|Monto|monto|días|mañana|hoy|más|menos)\b/

describe('traducción de avisos', () => {
  it('el español de México es el idioma principal y de respaldo', () => {
    expect(resolveLocale(undefined)).toBe('es-MX')
    expect(resolveLocale('fr-FR')).toBe('es-MX')
    expect(resolveLocale('en')).toBe('en-US')
    expect(resolveLocale('de-AT')).toBe('de-DE')
    expect(translate('Recordatorio guardado', 'es-MX')).toBe('Recordatorio guardado')
    expect(translate('Texto sin traducción', 'de-DE')).toBe('Texto sin traducción')
  })

  it.each(SERVER_MESSAGES)('traduce al inglés y al alemán: %s', (msg) => {
    for (const locale of ['en-US', 'de-DE'] as const) {
      const out = translate(msg, locale)
      expect(out, `${locale}: ${out}`).not.toMatch(SPANISH)
      expect(out).not.toBe(msg)
    }
  })

  it('conserva montos, proveedores, emojis y saltos de línea', () => {
    expect(translate('✅ Pago de Luz completado', 'en-US')).toBe('✅ Electricity payment completed')
    expect(translate('Tu servicio CFE vence el 12 de octubre de 2026.', 'en-US')).toBe('Your CFE service is due on October 12, 2026.')
    expect(translate('Tu servicio CFE vence el 12 de octubre de 2026.', 'de-DE')).toBe('Dein Dienst CFE ist am 12. Oktober 2026 fällig.')
    expect(translate('CFE vence el 12 de octubre.\n\nPaga desde PagoIA: https://pagoia.vercel.app', 'de-DE')).toBe(
      'CFE ist am 12. Oktober fällig.\n\nBezahle über PagoIA: https://pagoia.vercel.app',
    )
  })

  it('traduce los parámetros de la plantilla de WhatsApp', () => {
    expect(['luz', 'mañana (12 de octubre)', 'por confirmar'].map((p) => translate(p, 'en-US'))).toEqual(['electricity', 'tomorrow (October 12)', 'to be confirmed'])
    expect(['agua', 'en 3 días (15 de octubre)'].map((p) => translate(p, 'de-DE'))).toEqual(['Wasser', 'in 3 Tagen (15. Oktober)'])
  })

  it('los errores heredados en inglés se muestran en español a quien usa español', () => {
    expect(translate('You must be logged in to make payments', 'es-MX')).toBe('Inicia sesión para hacer pagos')
  })

  it('cada frase del catálogo tiene inglés y alemán', () => {
    for (const [es, e] of Object.entries(EXACT)) {
      expect(e.en.trim(), es).not.toBe('')
      expect(e.de.trim(), es).not.toBe('')
    }
  })
})
