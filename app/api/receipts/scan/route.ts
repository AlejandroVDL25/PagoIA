import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_PDF_BYTES, confidenceOf } from "@/lib/ai/receipt"
import { PROVIDER_INFO, extractReceiptData, getReceiptProvider } from "@/lib/ai/receipt-provider"
import { AiProviderError } from "@/lib/ai/errors"

export const runtime = "nodejs"
export const maxDuration = 60

const BodySchema = z.object({ path: z.string().min(3).max(300) })

const typeFromPath = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase()
  return ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"
}

/** Indica a la interfaz si el escaneo está disponible y con qué proveedor, para pedir el consentimiento correcto. */
export async function GET() {
  const provider = getReceiptProvider()
  return NextResponse.json({
    enabled: provider !== null,
    provider,
    company: provider ? PROVIDER_INFO[provider].company : null,
    country: provider ? PROVIDER_INFO[provider].country : null,
    trainsOnFreeTier: provider ? PROVIDER_INFO[provider].trainsOnFreeTier : false,
  })
}

/** Recibe la ruta de un archivo ya subido a receipts/{uid}/ y devuelve los datos extraídos para revisión. */
export async function POST(req: NextRequest) {
  if (!getReceiptProvider()) {
    return NextResponse.json({ error: "El escaneo de recibos no está configurado en este servidor." }, { status: 503 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Ruta inválida" }, { status: 400 })
  const { path } = parsed.data
  // Solo archivos de la carpeta del propio usuario; RLS de Storage lo vuelve a comprobar.
  if (!new RegExp(`^${user.id}/[\\w.\\-]+$`).test(path)) {
    return NextResponse.json({ error: "Ruta inválida" }, { status: 400 })
  }

  const { data: blob, error: downloadError } = await supabase.storage.from("receipts").download(path)
  if (downloadError || !blob) return NextResponse.json({ error: "No se encontró el archivo" }, { status: 404 })

  const mediaType =
    IMAGE_TYPES.includes(blob.type as (typeof IMAGE_TYPES)[number]) || blob.type === "application/pdf" ? blob.type : typeFromPath(path)
  const limit = mediaType === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
  if (blob.size > limit) {
    return NextResponse.json({ error: `El archivo pesa más de ${Math.round(limit / 1024 / 1024)} MB` }, { status: 413 })
  }

  try {
    const { provider, data: extraction } = await extractReceiptData(await blob.arrayBuffer(), mediaType)
    if (!extraction.es_recibo) {
      return NextResponse.json({ error: "No parece un recibo de servicio. Prueba con otra foto." }, { status: 422 })
    }

    const { data: receipt, error: insertError } = await supabase
      .from("receipts")
      .insert({
        user_id: user.id,
        storage_path: path,
        service_type: extraction.tipo_servicio,
        provider: extraction.proveedor,
        service_number_last4: extraction.numero_servicio_ultimos4,
        period_start: extraction.periodo_inicio,
        period_end: extraction.periodo_fin,
        due_date: extraction.fecha_limite,
        amount: extraction.total,
        consumption: extraction.consumo,
        consumption_unit: extraction.unidad_consumo,
        extracted: { ...extraction, ai_provider: provider },
        confidence: confidenceOf(extraction),
      })
      .select()
      .single()
    if (insertError) {
      console.error("[receipts/scan] insert:", insertError)
      return NextResponse.json({ error: "No se pudo guardar el recibo" }, { status: 500 })
    }

    return NextResponse.json({ receipt, dudosos: extraction.campos_dudosos })
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error("[receipts/scan]", error.message)
      return NextResponse.json({ error: error.userMessage }, { status: error.status })
    }
    console.error("[receipts/scan]", error)
    return NextResponse.json({ error: "No se pudo analizar el recibo." }, { status: 502 })
  }
}
