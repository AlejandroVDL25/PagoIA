import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAlertAndPush } from "@/lib/notifications/push"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type TransactionStatus = "completed" | "pending" | "failed"

export type SyncResult =
  | { recorded: true; created: boolean; transactionId: string; status: TransactionStatus; amount: number }
  | { recorded: false; reason: string }

type ExistingTransaction = { id: string; status: string; amount: number | string }

/** Usuario dueño de la sesión: client_reference_id (nuevo) o metadata.userId (sesiones anteriores). */
export function sessionUserId(session: Stripe.Checkout.Session): string | null {
  const id = session.client_reference_id ?? session.metadata?.userId ?? null
  return id && UUID.test(id) ? id : null
}

function statusFromSession(session: Stripe.Checkout.Session): TransactionStatus | null {
  if (session.payment_status === "paid" || session.payment_status === "no_payment_required") return "completed"
  // OXXO: la sesión se completa al generar la ficha y el dinero llega días después.
  if (session.payment_status === "unpaid" && session.status === "complete") return "pending"
  return null
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent
  if (!pi) return null
  return typeof pi === "string" ? pi : pi.id
}

/** Monto cobrado según Stripe (fuente de verdad); la metadata solo es respaldo. */
function amountFromSession(session: Stripe.Checkout.Session): number {
  if (typeof session.amount_total === "number") return Math.round(session.amount_total) / 100
  const fromMeta = Number(session.metadata?.amount ?? 0)
  return Number.isFinite(fromMeta) ? fromMeta : 0
}

async function findBySession(admin: SupabaseClient, sessionId: string): Promise<ExistingTransaction | null> {
  const bySession = await admin
    .from("transactions")
    .select("id, status, amount")
    .eq("stripe_session_id", sessionId)
    .maybeSingle<ExistingTransaction>()
  if (bySession.error) throw new Error(`Consulta de transacción: ${bySession.error.message}`)
  if (bySession.data) return bySession.data

  // Transacciones registradas antes de existir stripe_session_id guardaban la sesión en receipt_number.
  const byReceipt = await admin
    .from("transactions")
    .select("id, status, amount")
    .eq("receipt_number", sessionId)
    .maybeSingle<ExistingTransaction>()
  if (byReceipt.error) throw new Error(`Consulta de transacción: ${byReceipt.error.message}`)
  return byReceipt.data
}

/** Marca como pagados el servicio y el recibo pendiente ligados a la sesión. */
async function markPaidTargets(admin: SupabaseClient, session: Stripe.Checkout.Session, userId: string) {
  const now = new Date().toISOString()
  const serviceId = session.metadata?.serviceId
  if (serviceId && UUID.test(serviceId)) {
    const { error } = await admin
      .from("user_services")
      .update({ status: "paid", last_paid_at: now })
      .eq("id", serviceId)
      .eq("user_id", userId)
    if (error) console.error("[checkout-sync] user_services:", error.message)
  }
  let pendingId = session.metadata?.pendingPaymentId ?? null

  // Sin recibo ligado: se liquida el recibo escaneado pendiente del mismo servicio y por el mismo monto,
  // para que "Por pagar" baje en cuanto se paga el servicio desde Mis Servicios.
  if (!pendingId) {
    const serviceType = session.metadata?.serviceType
    const amount = amountFromSession(session)
    if (serviceType) {
      const { data, error } = await admin
        .from("pending_payments")
        .select("id, amount")
        .eq("user_id", userId)
        .eq("service_type", serviceType)
        .eq("status", "pending")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(10)
      if (error) console.error("[checkout-sync] búsqueda de pendiente:", error.message)
      const match = (data ?? []).find((p: { id: string; amount: number | string }) => Math.abs(Number(p.amount) - amount) < 0.01)
      pendingId = match?.id ?? null
    }
  }

  if (pendingId && UUID.test(pendingId)) {
    const { error } = await admin
      .from("pending_payments")
      .update({ status: "paid", paid_at: now, stripe_session_id: session.id })
      .eq("id", pendingId)
      .eq("user_id", userId)
    if (error) console.error("[checkout-sync] pending_payments:", error.message)
  }
}

/** El aviso nunca debe impedir que el pago quede registrado. */
async function notify(session: Stripe.Checkout.Session, userId: string, status: TransactionStatus, amount: number, admin: SupabaseClient) {
  try {
    await sendNotice(session, userId, status, amount, admin)
  } catch (error) {
    console.error("[checkout-sync] aviso:", error instanceof Error ? error.message : error)
  }
}

async function sendNotice(session: Stripe.Checkout.Session, userId: string, status: TransactionStatus, amount: number, admin: SupabaseClient) {
  const serviceName = session.metadata?.service ?? "tu servicio"
  const provider = session.metadata?.provider ?? ""
  const money = amount.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
  if (status === "pending") {
    await createAlertAndPush({
      userId,
      supabaseClient: admin,
      title: `Ficha OXXO lista: ${serviceName}`,
      message: `Paga ${money} en cualquier OXXO en los próximos 3 días. Te avisaremos cuando se confirme el pago.`,
      alertType: "warning",
      url: "/dashboard/historial",
      tag: `oxxo-voucher-${session.id}`,
      source: `checkout:${session.id}:pending`,
    })
    return
  }
  await createAlertAndPush({
    userId,
    supabaseClient: admin,
    title: `Pago de ${serviceName} completado`,
    message: `Se procesó tu pago de ${money}${provider ? ` a ${provider}` : ""}. Folio ${session.id.slice(-8).toUpperCase()}. Descarga tu comprobante desde Historial.`,
    alertType: "success",
    url: "/dashboard/historial",
    tag: `payment-completed-${session.id}`,
    source: `checkout:${session.id}:completed`,
  })
}

/**
 * Registra en Supabase una sesión de Checkout de forma idempotente.
 * La llaman el webhook y el regreso del navegador (success_url): el primero que llegue la crea
 * y el otro solo confirma que ya existe. Usa el cliente admin (service role), que no pasa por RLS.
 */
export async function syncCheckoutSession(admin: SupabaseClient, session: Stripe.Checkout.Session): Promise<SyncResult> {
  if (session.mode !== "payment") return { recorded: false, reason: "La sesión no es un pago" }
  const userId = sessionUserId(session)
  if (!userId) return { recorded: false, reason: "La sesión no tiene usuario" }
  const status = statusFromSession(session)
  if (!status) return { recorded: false, reason: `Pago aún no confirmado (${session.payment_status})` }

  const amount = amountFromSession(session)
  const existing = await findBySession(admin, session.id)

  if (existing) {
    // Ficha OXXO que ya se pagó: se promueve de pending a completed.
    if (existing.status !== "completed" && status === "completed") {
      const { error } = await admin.from("transactions").update({ status: "completed" }).eq("id", existing.id)
      if (error) throw new Error(`Actualización de transacción: ${error.message}`)
      await markPaidTargets(admin, session, userId)
      await notify(session, userId, "completed", amount, admin)
      return { recorded: true, created: false, transactionId: existing.id, status: "completed", amount }
    }
    const current: TransactionStatus = existing.status === "completed" || existing.status === "failed" ? existing.status : "pending"
    return { recorded: true, created: false, transactionId: existing.id, status: current, amount: Number(existing.amount) }
  }

  const serviceType = session.metadata?.serviceType || session.metadata?.serviceId || "other"
  const { data, error } = await admin
    .from("transactions")
    .insert({
      user_id: userId,
      service_type: serviceType,
      provider: session.metadata?.provider || "Stripe",
      amount,
      currency: (session.currency ?? "mxn").toUpperCase(),
      status,
      receipt_number: session.id,
      stripe_session_id: session.id,
      stripe_payment_intent: paymentIntentId(session),
      transaction_date: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      metadata: {
        service: session.metadata?.service ?? null,
        serviceId: session.metadata?.serviceId ?? null,
        pendingPaymentId: session.metadata?.pendingPaymentId ?? null,
        livemode: session.livemode,
      },
    })
    .select("id")
    .single<{ id: string }>()

  if (error) {
    // 23505: el webhook y el regreso del navegador llegaron al mismo tiempo; la otra petición ya la guardó.
    if (error.code === "23505") {
      const again = await findBySession(admin, session.id)
      if (again) {
        const current: TransactionStatus = again.status === "completed" || again.status === "failed" ? again.status : "pending"
        return { recorded: true, created: false, transactionId: again.id, status: current, amount: Number(again.amount) }
      }
    }
    throw new Error(`Insert de transacción (${error.code ?? "?"}): ${error.message}`)
  }

  if (status === "completed") await markPaidTargets(admin, session, userId)
  await notify(session, userId, status, amount, admin)
  return { recorded: true, created: true, transactionId: data.id, status, amount }
}

/** Ficha OXXO vencida o rechazada: la transacción pendiente queda como fallida. */
export async function failCheckoutSession(admin: SupabaseClient, session: Stripe.Checkout.Session): Promise<void> {
  const userId = sessionUserId(session)
  if (!userId) return
  const existing = await findBySession(admin, session.id)
  if (!existing || existing.status === "failed") return
  const { error } = await admin.from("transactions").update({ status: "failed" }).eq("id", existing.id)
  if (error) throw new Error(`Actualización de transacción: ${error.message}`)
  const serviceName = session.metadata?.service ?? "tu servicio"
  try {
    await createAlertAndPush({
      userId,
      supabaseClient: admin,
      title: `La ficha OXXO de ${serviceName} venció`,
      message: "No se registró el pago. Puedes generar una ficha nueva desde Mis Pagos.",
      alertType: "error",
      url: "/dashboard/servicios",
      tag: `oxxo-expired-${session.id}`,
      source: `checkout:${session.id}:failed`,
    })
  } catch (error) {
    console.error("[checkout-sync] aviso:", error instanceof Error ? error.message : error)
  }
}
