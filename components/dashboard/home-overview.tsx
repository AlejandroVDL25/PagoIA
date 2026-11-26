"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  Bell,
  ChevronRight,
  CreditCard,
  Droplet,
  Eye,
  EyeOff,
  Flame,
  History,
  Phone,
  ReceiptText,
  RefreshCw,
  ScanLine,
  Tv,
  Wifi,
  Zap,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { daysUntil, nextDueDate, parseDueDay } from "@/lib/due-dates"
import { formatMXN, serviceLabel } from "@/lib/services-meta"
import { cn } from "@/lib/utils"

const HIDE_AMOUNTS_KEY = "pagoia-hide-amounts-v1"
const FEED_LIMIT = 8

type TransactionRow = {
  id: string
  service_type: string | null
  provider: string | null
  amount: number | string
  status: string
  transaction_date: string
}

type PendingRow = {
  id: string
  service_type: string
  provider: string | null
  amount: number | string
  due_date: string | null
  status: string
  created_at: string
}

type ReceiptRow = {
  id: string
  service_type: string | null
  provider: string | null
  amount: number | string | null
  status: "pending_review" | "confirmed" | "rejected"
  created_at: string
}

type ServiceRow = {
  id: string
  service_type: string
  provider: string | null
  last_amount: number | string | null
  due_date: number | string | null
  status: string
}

type FeedStatus = "completed" | "pending" | "to_pay" | "ai_scanned" | "ai_review"

type FeedItem = {
  key: string
  title: string
  subtitle: string
  date: Date
  amount: number | null
  status: FeedStatus
  serviceType: string | null
  href: string
}

type Overview = {
  paidThisMonth: number
  toPay: number
  dueSoon: number
  feed: FeedItem[]
}

const EMPTY: Overview = { paidThisMonth: 0, toPay: 0, dueSoon: 0, feed: [] }

const SERVICE_ICONS: Record<string, LucideIcon> = {
  electricity: Zap,
  water: Droplet,
  gas: Flame,
  internet: Wifi,
  phone: Phone,
  tv: Tv,
}

const STATUS_BADGES: Record<FeedStatus, { label: string; className: string }> = {
  completed: { label: "Completado", className: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200" },
  pending: { label: "En proceso", className: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100" },
  to_pay: { label: "Por pagar", className: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100" },
  ai_scanned: { label: "Escaneado con IA", className: "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100" },
  ai_review: { label: "IA · por revisar", className: "bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-100" },
}

const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon; ariaLabel: string }[] = [
  { label: "Escanear", href: "/dashboard/recibos", icon: ScanLine, ariaLabel: "Escanear recibo con IA" },
  { label: "Pagar", href: "/dashboard/servicios", icon: CreditCard, ariaLabel: "Pagar un servicio" },
  { label: "Movimientos", href: "/dashboard/historial", icon: History, ariaLabel: "Ver movimientos" },
  { label: "Avisos", href: "/dashboard/notificaciones", icon: Bell, ariaLabel: "Ver notificaciones" },
]

const toNumber = (value: number | string | null | undefined): number => {
  const n = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

const dateOnly = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`)

function formatWhen(date: Date): string {
  const today = new Date()
  const diff = daysUntil(date, today)
  const time = date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
  if (diff === 0) return `Hoy, ${time}`
  if (diff === -1) return `Ayer, ${time}`
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" })
}

function buildOverview(
  transactions: TransactionRow[],
  pending: PendingRow[],
  receipts: ReceiptRow[],
  services: ServiceRow[],
): Overview {
  const now = new Date()
  const paidThisMonth = transactions
    .filter((t) => {
      const d = new Date(t.transaction_date)
      return t.status === "completed" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((sum, t) => sum + toNumber(t.amount), 0)

  const toPay = pending.reduce((sum, p) => sum + toNumber(p.amount), 0)

  // Vencimientos en los próximos 7 días: pagos pendientes con fecha + servicios con día de corte.
  const pendingDue = pending.filter((p) => {
    if (!p.due_date) return false
    const d = daysUntil(dateOnly(p.due_date), now)
    return d >= 0 && d <= 7
  }).length
  const servicesDue = services.filter((s) => {
    if (s.status !== "active") return false
    const day = parseDueDay(s.due_date)
    if (day === null) return false
    const d = daysUntil(nextDueDate(day, now), now)
    return d >= 0 && d <= 7
  }).length

  const feed: FeedItem[] = [
    ...transactions.map<FeedItem>((t) => ({
      key: `tx-${t.id}`,
      title: t.provider ?? serviceLabel(t.service_type),
      subtitle: `Pago de ${serviceLabel(t.service_type).toLowerCase()}`,
      date: new Date(t.transaction_date),
      amount: toNumber(t.amount),
      status: t.status === "completed" ? "completed" : "pending",
      serviceType: t.service_type,
      href: "/dashboard/historial",
    })),
    ...pending.map<FeedItem>((p) => ({
      key: `pp-${p.id}`,
      title: p.provider ?? serviceLabel(p.service_type),
      subtitle: p.due_date ? `Vence el ${dateOnly(p.due_date).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}` : "Pago pendiente",
      date: new Date(p.created_at),
      amount: toNumber(p.amount),
      status: "to_pay",
      serviceType: p.service_type,
      href: "/dashboard/servicios",
    })),
    ...receipts
      .filter((r) => r.status !== "rejected")
      .map<FeedItem>((r) => ({
        key: `rc-${r.id}`,
        title: r.provider ?? "Recibo escaneado",
        subtitle: `Recibo de ${serviceLabel(r.service_type).toLowerCase()}`,
        date: new Date(r.created_at),
        amount: r.amount === null ? null : toNumber(r.amount),
        status: r.status === "confirmed" ? "ai_scanned" : "ai_review",
        serviceType: r.service_type,
        href: "/dashboard/recibos",
      })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, FEED_LIMIT)

  return { paidThisMonth, toPay, dueSoon: pendingDue + servicesDue, feed }
}

/** Inicio del panel: tarjeta principal, acciones rápidas y actividad reciente con datos reales de Supabase. */
export function HomeOverview() {
  const supabase = useMemo(() => createClient(), [])
  const [overview, setOverview] = useState<Overview>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_AMOUNTS_KEY) === "1")
    } catch {
      setHidden(false)
    }
  }, [])

  const toggleHidden = () => {
    setHidden((value) => {
      const next = !value
      try {
        if (next) localStorage.setItem(HIDE_AMOUNTS_KEY, "1")
        else localStorage.removeItem(HIDE_AMOUNTS_KEY)
      } catch {
        // Sin almacenamiento local solo se pierde la preferencia al recargar.
      }
      return next
    })
  }

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError("Tu sesión expiró. Vuelve a iniciar sesión.")
        return
      }
      setUserId(user.id)

      const [tx, pp, rc, sv] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, service_type, provider, amount, status, transaction_date")
          .eq("user_id", user.id)
          .order("transaction_date", { ascending: false })
          .limit(100),
        supabase
          .from("pending_payments")
          .select("id, service_type, provider, amount, due_date, status, created_at")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("receipts")
          .select("id, service_type, provider, amount, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(FEED_LIMIT),
        supabase
          .from("user_services")
          .select("id, service_type, provider, last_amount, due_date, status")
          .eq("user_id", user.id),
      ])

      const firstError = tx.error ?? pp.error ?? rc.error ?? sv.error
      if (firstError) throw firstError

      setOverview(
        buildOverview(
          (tx.data ?? []) as TransactionRow[],
          (pp.data ?? []) as PendingRow[],
          (rc.data ?? []) as ReceiptRow[],
          (sv.data ?? []) as ServiceRow[],
        ),
      )
      setError(null)
    } catch (e) {
      console.error("[HomeOverview]", e)
      setError("No pudimos actualizar tu resumen. Revisa tu conexión.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load])

  // Tiempo real: cualquier cambio en pagos, pendientes o recibos del usuario recarga el resumen.
  // Volver a la pestaña también recarga, por si Realtime no está habilitado en alguna tabla.
  useEffect(() => {
    if (!userId) return
    const filter = `user_id=eq.${userId}`
    const channel = supabase
      .channel(`home-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_payments", filter }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "receipts", filter }, () => void load())
      .subscribe()
    const onVisible = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId, load])

  const money = (n: number) => (hidden ? "$ •••••" : formatMXN(n))
  const monthLabel = new Date().toLocaleDateString("es-MX", { month: "long" })

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {/* ── Tarjeta principal ── */}
      <section
        aria-labelledby="hero-title"
        className="relative w-full max-w-full overflow-hidden rounded-2xl bg-gradient-to-br from-sky-700 to-cyan-800 p-4 text-white shadow-lg sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="hero-title" className="text-sm font-medium text-white/90">
              Pagado en {monthLabel}
            </h2>
            <p className="mt-1 truncate text-2xl font-bold tabular-nums tracking-tight sm:text-4xl" aria-live="polite">
              {loading ? <span className="inline-block h-9 w-40 animate-pulse rounded bg-white/20" aria-label="Cargando" /> : money(overview.paidThisMonth)}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleHidden}
            aria-label={hidden ? "Mostrar montos" : "Ocultar montos"}
            aria-pressed={hidden}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {hidden ? <EyeOff className="h-6 w-6" aria-hidden="true" /> : <Eye className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>

        <dl className="mt-5 grid w-full grid-cols-2 gap-2.5 sm:gap-4">
          <div className="min-w-0 rounded-xl bg-white/10 p-3 sm:p-4">
            <dt className="truncate text-sm text-white/90">Por pagar</dt>
            <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums sm:text-2xl">{loading ? "…" : money(overview.toPay)}</dd>
          </div>
          <div className="min-w-0 rounded-xl bg-white/10 p-3 sm:p-4">
            <dt className="text-sm leading-tight text-white/90">Vencen en 7 días</dt>
            <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums sm:text-2xl">
              {loading ? "…" : `${overview.dueSoon} ${overview.dueSoon === 1 ? "pago" : "pagos"}`}
            </dd>
          </div>
        </dl>

        <Link
          href="/dashboard/servicios"
          className="mt-5 flex min-h-12 w-full max-w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold sm:text-base text-sky-800 transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-sky-700"
        >
          <CreditCard className="h-5 w-5" aria-hidden="true" />
          Pagar mis servicios
        </Link>
      </section>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="flex min-h-11 items-center gap-1 rounded-lg px-3 font-semibold hover:bg-destructive/10"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
          </button>
        </div>
      )}

      {/* ── Acciones rápidas ── */}
      <nav aria-label="Acciones rápidas">
        <ul className="grid w-full grid-cols-4 gap-2 sm:gap-4">
          {QUICK_ACTIONS.map((action) => (
            <li key={action.href} className="min-w-0">
              <Link
                href={action.href}
                aria-label={action.ariaLabel}
                className="group flex min-h-24 min-w-0 flex-col items-center justify-center rounded-2xl p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border sm:h-14 sm:w-14 border-border bg-card text-primary shadow-sm transition-transform group-active:scale-95",
                    action.label === "Escanear" && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  <action.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="mt-1.5 w-full truncate text-xs font-medium leading-tight text-foreground sm:text-sm">{action.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Actividad reciente ── */}
      <section aria-labelledby="activity-title" className="w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex w-full items-center justify-between gap-2 px-4 pt-4">
          <h2 id="activity-title" className="min-w-0 truncate text-base font-semibold text-foreground">
            Actividad reciente
          </h2>
          <Link
            href="/dashboard/historial"
            className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver todo <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {loading ? (
          <ul className="space-y-3 p-4" aria-label="Cargando actividad">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </ul>
        ) : overview.feed.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <ReceiptText className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Todavía no hay movimientos. Escanea un recibo o agrega un servicio para empezar.
            </p>
            <Link
              href="/dashboard/recibos"
              className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <ScanLine className="h-5 w-5" aria-hidden="true" /> Escanear mi primer recibo
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {overview.feed.map((item) => {
              const Icon = (item.serviceType && SERVICE_ICONS[item.serviceType]) || ReceiptText
              const badge = STATUS_BADGES[item.status]
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex min-h-16 w-full min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60 focus-visible:bg-secondary focus-visible:outline-none"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-foreground">{item.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {item.subtitle} · {formatWhen(item.date)}
                      </span>
                      <span className={cn("mt-1 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-semibold", badge.className)}>
                        {badge.label}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-foreground sm:text-base">
                      {item.amount === null ? "—" : money(item.amount)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
