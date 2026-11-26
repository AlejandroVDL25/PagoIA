import { ReceiptSchema, RECEIPT_FIELDS, SERVICE_TYPES, RECEIPT_PROMPT, normalizeExtraction, type ReceiptExtraction } from "@/lib/ai/receipt"
import { AiProviderError } from "@/lib/ai/errors"

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

/** Modelo estable con plan gratuito, pensado para leer documentos. Se puede cambiar con GEMINI_MODEL. */
const DEFAULT_MODEL = "gemini-3.5-flash-lite"
/** Respaldo si el modelo principal no existe en la cuenta (404). */
const FALLBACK_MODEL = "gemini-3.1-flash-lite"

const nullable = (type: "string" | "number") => ({ type: [type, "null"] })

/** Esquema JSON equivalente a ReceiptSchema, para que Gemini responda solo con estos campos. */
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    es_recibo: { type: "boolean" },
    proveedor: nullable("string"),
    tipo_servicio: { type: ["string", "null"], enum: [...SERVICE_TYPES, null] },
    numero_servicio_ultimos4: nullable("string"),
    periodo_inicio: nullable("string"),
    periodo_fin: nullable("string"),
    fecha_limite: nullable("string"),
    total: nullable("number"),
    consumo: nullable("number"),
    unidad_consumo: nullable("string"),
    campos_dudosos: { type: "array", items: { type: "string", enum: [...RECEIPT_FIELDS] } },
  },
  required: [
    "es_recibo",
    "proveedor",
    "tipo_servicio",
    "numero_servicio_ultimos4",
    "periodo_inicio",
    "periodo_fin",
    "fecha_limite",
    "total",
    "consumo",
    "unidad_consumo",
    "campos_dudosos",
  ],
} as const

/** Si la API no acepta el esquema, se manda la misma forma descrita en el texto. */
const SCHEMA_IN_PROMPT = `Responde SOLO con un objeto JSON con estas llaves exactas:
es_recibo (boolean), proveedor (string|null), tipo_servicio (uno de ${SERVICE_TYPES.join(", ")} o null),
numero_servicio_ultimos4 (string|null), periodo_inicio (string AAAA-MM-DD|null), periodo_fin (string AAAA-MM-DD|null),
fecha_limite (string AAAA-MM-DD|null), total (number|null), consumo (number|null), unidad_consumo (string|null),
campos_dudosos (arreglo con valores de: ${RECEIPT_FIELDS.join(", ")}).`

type GeminiPart = { text?: string }
type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  error?: { code?: number; message?: string; status?: string }
}

function isGeminiResponse(value: unknown): value is GeminiResponse {
  return typeof value === "object" && value !== null
}

async function callGemini(model: string, apiKey: string, file: ArrayBuffer, mediaType: string, withSchema: boolean): Promise<Response> {
  const data = Buffer.from(file).toString("base64")
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: mediaType, data } },
          { text: withSchema ? RECEIPT_PROMPT : `${RECEIPT_PROMPT}\n\n${SCHEMA_IN_PROMPT}` },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      ...(withSchema ? { responseJsonSchema: RESPONSE_JSON_SCHEMA } : {}),
    },
  }
  return fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(50_000),
  })
}

function errorFromResponse(status: number, payload: GeminiResponse): AiProviderError {
  const detail = payload.error?.message ?? `HTTP ${status}`
  if (status === 429) {
    return new AiProviderError("Se alcanzó el límite gratuito de la IA por ahora. Intenta de nuevo en un minuto.", detail, status)
  }
  if (status === 400 && /api key/i.test(detail)) {
    return new AiProviderError("La llave de Gemini no es válida. Revisa GEMINI_API_KEY en Vercel.", detail, status)
  }
  if (status === 403) {
    return new AiProviderError("La llave de Gemini no tiene permiso para este modelo.", detail, status)
  }
  return new AiProviderError("No se pudo analizar el recibo en este momento.", detail, status)
}

/** Lee un recibo (foto o PDF) con Gemini y devuelve los campos validados con ReceiptSchema. */
export async function extractReceiptWithGemini(file: ArrayBuffer, mediaType: string): Promise<ReceiptExtraction> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new AiProviderError("El escaneo con IA no está configurado.", "Falta GEMINI_API_KEY", 503)

  const models = [process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL]
  if (!models.includes(FALLBACK_MODEL)) models.push(FALLBACK_MODEL)

  let lastError: AiProviderError | null = null
  for (const model of models) {
    for (const withSchema of [true, false]) {
      const response = await callGemini(model, apiKey, file, mediaType, withSchema)
      const raw: unknown = await response.json().catch(() => ({}))
      const payload: GeminiResponse = isGeminiResponse(raw) ? raw : {}

      if (!response.ok) {
        const detail = payload.error?.message ?? ""
        console.error(`[gemini] ${model} schema=${withSchema} → ${response.status}: ${detail}`)
        lastError = errorFromResponse(response.status, payload)
        // Esquema no aceptado por la API: reintentar con el esquema descrito en el texto.
        if (response.status === 400 && withSchema && /schema|unknown name|invalid json payload/i.test(detail)) continue
        // Modelo inexistente o retirado: probar el modelo de respaldo.
        if (response.status === 404) break
        throw lastError
      }

      if (payload.promptFeedback?.blockReason) {
        throw new AiProviderError("La IA no pudo procesar este archivo.", `Bloqueado: ${payload.promptFeedback.blockReason}`, 422)
      }
      const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? ""
      if (!text) throw new AiProviderError("No se pudieron leer los datos del recibo.", "Respuesta vacía de Gemini", 502)

      let json: unknown
      try {
        json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""))
      } catch {
        throw new AiProviderError("No se pudieron leer los datos del recibo.", `JSON inválido: ${text.slice(0, 200)}`, 502)
      }
      const parsed = ReceiptSchema.safeParse(json)
      if (!parsed.success) {
        throw new AiProviderError("No se pudieron leer los datos del recibo.", `Esquema inválido: ${parsed.error.message.slice(0, 300)}`, 502)
      }
      return normalizeExtraction(parsed.data)
    }
  }
  throw lastError ?? new AiProviderError("No se pudo analizar el recibo en este momento.", "Sin modelos disponibles", 502)
}
