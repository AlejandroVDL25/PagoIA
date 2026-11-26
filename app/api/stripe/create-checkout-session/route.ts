import Stripe from "stripe"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { resolveBaseUrl } from "@/lib/app-url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Métodos habilitados, p. ej. "card,oxxo". OXXO requiere una cuenta de Stripe registrada en México
// y montos entre $10 y $10,000 MXN.
const PAYMENT_METHODS = (process.env.STRIPE_PAYMENT_METHODS || "card")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean) as Stripe.Checkout.SessionCreateParams.PaymentMethodType[]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BodySchema = z.object({
  // Stripe exige al menos $10 MXN por cobro en MXN; el tope evita errores de captura.
  amount: z.coerce.number().finite().min(10, "El monto mínimo es de $10 MXN").max(100000, "El monto máximo es de $100,000 MXN"),
  service: z.string().trim().min(1).max(80),
  serviceId: z.string().trim().min(1).max(80),
  provider: z.string().trim().max(80).optional(),
  serviceType: z.string().trim().max(40).optional(),
  /** Recibo escaneado (pending_payments.id) que se liquida con este pago. */
  pendingPaymentId: z.string().regex(UUID).optional(),
})

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secret) return NextResponse.json({ error: "Los pagos no están configurados en este servidor." }, { status: 503 })

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json({ error: first?.message ?? "Datos de pago inválidos" }, { status: 400 })
  }
  const { amount, service, serviceId, provider, serviceType, pendingPaymentId } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Inicia sesión para pagar" }, { status: 401 })

  // Si el pago es de un servicio guardado, debe pertenecer al usuario (RLS lo vuelve a comprobar).
  if (UUID.test(serviceId)) {
    const { data: owned, error } = await supabase.from("user_services").select("id").eq("id", serviceId).maybeSingle()
    if (error || !owned) return NextResponse.json({ error: "No encontramos ese servicio en tu cuenta" }, { status: 404 })
  }

  const baseUrl = resolveBaseUrl(req)
  const amountCents = Math.round(amount * 100)
  const label = provider ? `Pago de ${service} — ${provider}` : `Pago de ${service}`

  try {
    const stripe = new Stripe(secret)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: PAYMENT_METHODS,
      ...(PAYMENT_METHODS.includes("oxxo") ? { payment_method_options: { oxxo: { expires_after_days: 3 } } } : {}),
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "mxn",
            product_data: { name: label, description: `Servicio: ${service}${provider ? ` | Proveedor: ${provider}` : ""}` },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard/servicios?payment=success&service=${encodeURIComponent(service)}&provider=${encodeURIComponent(provider ?? "")}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/servicios?payment=cancelled`,
      metadata: {
        userId: user.id,
        serviceId,
        serviceType: serviceType || serviceId,
        service,
        provider: provider || "Desconocido",
        amount: (amountCents / 100).toFixed(2),
        ...(pendingPaymentId ? { pendingPaymentId } : {}),
      },
      // El cargo también lleva el usuario, para ubicarlo en disputas y reembolsos.
      payment_intent_data: { metadata: { userId: user.id, serviceId } },
    })

    if (!session.url) throw new Error("Stripe no devolvió la URL de pago")
    return NextResponse.json({ sessionId: session.id, url: session.url, status: "success" })
  } catch (error) {
    const message = error instanceof Stripe.errors.StripeError ? error.message : "No se pudo iniciar el pago"
    console.error("[stripe/create-checkout-session]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
