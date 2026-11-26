import Anthropic from "@anthropic-ai/sdk"
import { extractReceipt as extractReceiptWithClaude, type ReceiptExtraction } from "@/lib/ai/receipt"
import { extractReceiptWithGemini } from "@/lib/ai/receipt-gemini"
import { AiProviderError } from "@/lib/ai/errors"

export type ReceiptProvider = "gemini" | "anthropic"

/** Datos que la pantalla necesita para pedir el consentimiento correcto. */
export const PROVIDER_INFO: Record<ReceiptProvider, { company: string; country: string; trainsOnFreeTier: boolean }> = {
  gemini: { company: "Google (Gemini)", country: "Estados Unidos", trainsOnFreeTier: true },
  anthropic: { company: "Anthropic (Claude)", country: "Estados Unidos", trainsOnFreeTier: false },
}

/**
 * Proveedor activo. RECEIPT_AI_PROVIDER lo fuerza; si no, se prefiere Gemini (tiene plan gratuito)
 * y luego Anthropic. Devuelve null si no hay ninguna llave configurada.
 */
export function getReceiptProvider(): ReceiptProvider | null {
  const forced = process.env.RECEIPT_AI_PROVIDER?.trim().toLowerCase()
  if (forced === "gemini" && process.env.GEMINI_API_KEY) return "gemini"
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic"
  if (process.env.GEMINI_API_KEY) return "gemini"
  if (process.env.ANTHROPIC_API_KEY) return "anthropic"
  return null
}

function anthropicError(error: unknown): AiProviderError | null {
  if (!(error instanceof Anthropic.APIError)) return null
  const detail = error.message
  if (/credit balance/i.test(detail)) {
    return new AiProviderError(
      "El servicio de IA no tiene saldo por ahora. Mientras tanto, agrega tu recibo desde Mis Pagos.",
      detail,
      503,
    )
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError("El servicio está ocupado. Intenta de nuevo en un minuto.", detail, 429)
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiProviderError("La llave de Anthropic no es válida. Revisa ANTHROPIC_API_KEY en Vercel.", detail, 503)
  }
  return new AiProviderError("No se pudo analizar el recibo en este momento.", detail, 502)
}

/** Extrae los datos del recibo con el proveedor configurado y traduce sus errores a mensajes en español. */
export async function extractReceiptData(file: ArrayBuffer, mediaType: string): Promise<{ provider: ReceiptProvider; data: ReceiptExtraction }> {
  const provider = getReceiptProvider()
  if (!provider) throw new AiProviderError("El escaneo con IA no está configurado en este servidor.", "Sin llaves de IA", 503)

  if (provider === "gemini") {
    return { provider, data: await extractReceiptWithGemini(file, mediaType) }
  }
  try {
    return { provider, data: await extractReceiptWithClaude(file, mediaType) }
  } catch (error) {
    throw anthropicError(error) ?? error
  }
}
