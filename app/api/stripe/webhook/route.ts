import Stripe from "stripe"
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createAlertAndPush } from "@/lib/notifications/push"
import { saveCardFromSetupSession } from "@/lib/payments/autopay-stripe"
import { failCheckoutSession, syncCheckoutSession } from "@/lib/payments/checkout-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getWebhookRuntime() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

  if (!stripeSecretKey || !webhookSecret) return { error: "Stripe webhook no configurado." } as const
  if (!supabaseUrl || !serviceRoleKey) return { error: "Supabase admin no configurado." } as const

  return { stripe: new Stripe(stripeSecretKey), webhookSecret } as const
}

/**
 * Webhook de Stripe. La firma HMAC-SHA256 se valida sobre el cuerpo crudo (req.text()).
 * Si algo falla al guardar se responde 500 para que Stripe reintente; el registro es
 * idempotente, así que un reintento nunca duplica el pago.
 */
export async function POST(req: NextRequest) {
  const rt = getWebhookRuntime()
  if ("error" in rt) {
    console.error("[stripe/webhook]", rt.error)
    return NextResponse.json({ error: rt.error }, { status: 503 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: "Falta la firma stripe-signature" }, { status: 400 })

  let event: Stripe.Event
  try {
    event = rt.stripe.webhooks.constructEvent(rawBody, signature, rt.webhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[stripe/webhook] firma inválida:", message)
    return NextResponse.json({ error: `Firma inválida: ${message}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object
        if (session.mode === "setup") {
          await saveCardFromSetupSession(rt.stripe, createAdminClient(), session)
          break
        }
        const result = await syncCheckoutSession(createAdminClient(), session)
        if (!result.recorded) console.warn(`[stripe/webhook] ${event.id} no registrado: ${result.reason}`)
        break
      }
      // OXXO: la ficha se paga (o vence) días después de completar la sesión.
      case "checkout.session.async_payment_succeeded": {
        await syncCheckoutSession(createAdminClient(), event.data.object)
        break
      }
      case "checkout.session.async_payment_failed": {
        await failCheckoutSession(createAdminClient(), event.data.object)
        break
      }
      case "charge.dispute.created": {
        await handleChargeDispute(event.data.object, rt.stripe)
        break
      }
      default:
        break
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[stripe/webhook] ${event.type} ${event.id}:`, message)
    // 500 → Stripe reintenta con backoff hasta 3 días. Antes se respondía 200 y el pago se perdía.
    return NextResponse.json({ error: "No se pudo registrar el evento" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

/** Disputa (contracargo): se avisa al dueño del pago. */
async function handleChargeDispute(dispute: Stripe.Dispute, stripe: Stripe) {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id
  const charge = await stripe.charges.retrieve(chargeId)
  let userId: string | null = charge.metadata?.userId ?? null
  if (!userId && typeof charge.payment_intent === "string") {
    const sessions = await stripe.checkout.sessions.list({ payment_intent: charge.payment_intent, limit: 1 })
    const session = sessions.data[0]
    userId = session?.client_reference_id ?? session?.metadata?.userId ?? null
  }
  if (!userId) {
    console.warn(`[stripe/webhook] disputa ${dispute.id} sin usuario`)
    return
  }
  try {
    await createAlertAndPush({
      userId,
      supabaseClient: createAdminClient(),
      title: "Disputa de pago",
      message: `Se reportó una disputa por $${(dispute.amount / 100).toFixed(2)} MXN. La revisaremos en 7 a 10 días hábiles.`,
      alertType: "error",
      url: "/dashboard/notificaciones",
      tag: `dispute-${dispute.id}`,
      source: `dispute:${dispute.id}`,
    })
  } catch (error) {
    console.error("[stripe/webhook] aviso de disputa:", error instanceof Error ? error.message : error)
  }
}
