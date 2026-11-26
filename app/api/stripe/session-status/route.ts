import Stripe from "stripe"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sessionUserId, syncCheckoutSession } from "@/lib/payments/checkout-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Al volver de Stripe (success_url) el navegador consulta la sesión y, si el webhook todavía
 * no llegó, la registra aquí mismo de forma idempotente. Así el pago aparece al instante.
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id")
  if (!sessionId || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return NextResponse.json({ error: "session_id inválido" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secret) return NextResponse.json({ error: "Stripe no está configurado" }, { status: 503 })
  const stripe = new Stripe(secret)

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return NextResponse.json({ error: "No se pudo consultar la sesión" }, { status: 502 })
  }
  // Solo el dueño de la sesión puede consultarla.
  if (sessionUserId(session) !== user.id) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })
  }

  try {
    const result = await syncCheckoutSession(createAdminClient(), session)
    return NextResponse.json({
      paymentStatus: session.payment_status,
      recorded: result.recorded,
      status: result.recorded ? result.status : null,
      amount: result.recorded ? result.amount : null,
      transactionId: result.recorded ? result.transactionId : null,
    })
  } catch (error) {
    console.error("[stripe/session-status]", error instanceof Error ? error.message : error)
    // El cobro sí existe; el webhook lo volverá a intentar. La interfaz avisa sin perder el estado.
    return NextResponse.json({ paymentStatus: session.payment_status, recorded: false, status: null, amount: null, transactionId: null })
  }
}
