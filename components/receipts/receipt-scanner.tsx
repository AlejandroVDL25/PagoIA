"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Camera, FileUp, Loader2, ScanLine, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useLocale } from "@/components/i18n/locale-provider"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { createClient } from "@/lib/supabase/client"
import { compressImage } from "@/lib/image-compress"
import { cn } from "@/lib/utils"

const SERVICE_LABELS: Record<string, string> = {
  electricity: "Luz",
  water: "Agua",
  gas: "Gas",
  internet: "Internet",
  phone: "Teléfono",
  other: "Otro",
}

const CONSENT_KEY = "pagoia-receipt-consent-v2"

type ProviderInfo = { provider: string; company: string; country: string; trainsOnFreeTier: boolean }

/** Valida la respuesta de GET /api/receipts/scan; null si el escaneo no está disponible. */
function parseProviderInfo(value: unknown): ProviderInfo | null {
  if (typeof value !== "object" || value === null) return null
  const v = value as Record<string, unknown>
  if (v.enabled !== true || typeof v.provider !== "string" || typeof v.company !== "string") return null
  return {
    provider: v.provider,
    company: v.company,
    country: typeof v.country === "string" ? v.country : "",
    trainsOnFreeTier: v.trainsOnFreeTier === true,
  }
}

type Receipt = {
  id: string
  storage_path: string
  service_type: string | null
  provider: string | null
  service_number_last4: string | null
  period_start: string | null
  period_end: string | null
  due_date: string | null
  amount: number | null
  consumption: number | null
  consumption_unit: string | null
  confidence: number | null
  status: "pending_review" | "confirmed" | "rejected"
  created_at: string
}

type Form = {
  provider: string
  service_type: string
  amount: string
  due_date: string
  period_start: string
  period_end: string
  consumption: string
}

type Stage = "idle" | "compressing" | "uploading" | "analyzing" | "review" | "saving"

const STAGE_MESSAGES: Partial<Record<Stage, string>> = {
  compressing: "Preparando la foto…",
  uploading: "Subiendo tu recibo…",
  analyzing: "La IA está leyendo tu recibo…",
  saving: "Guardando…",
}

const toForm = (r: Receipt): Form => ({
  provider: r.provider ?? "",
  service_type: r.service_type ?? "electricity",
  amount: r.amount != null ? String(r.amount) : "",
  due_date: r.due_date ?? "",
  period_start: r.period_start ?? "",
  period_end: r.period_end ?? "",
  consumption: r.consumption != null ? String(r.consumption) : "",
})

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_PDF_MB = 10

const formatMoney = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
const formatDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—"

export function ReceiptScanner() {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const { t } = useLocale()
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [consent, setConsent] = useState(false)
  const [stage, setStage] = useState<Stage>("idle")
  const [current, setCurrent] = useState<Receipt | null>(null)
  const [dudosos, setDudosos] = useState<string[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [history, setHistory] = useState<Receipt[]>([])
  const [scanEnabled, setScanEnabled] = useState<boolean | null>(null)
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null)

  useEffect(() => {
    fetch("/api/receipts/scan")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        const info = parseProviderInfo(d)
        setProviderInfo(info)
        setScanEnabled(info !== null)
      })
      .catch(() => setScanEnabled(false))
  }, [])

  // El consentimiento se guarda por proveedor: si cambia la empresa que recibe la imagen, se vuelve a pedir.
  const consentKey = providerInfo ? `${CONSENT_KEY}-${providerInfo.provider}` : null

  useEffect(() => {
    if (!consentKey) return
    try {
      setConsent(localStorage.getItem(consentKey) === "1")
    } catch {
      setConsent(false)
    }
  }, [consentKey])

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from("receipts").select("*").order("created_at", { ascending: false }).limit(10)
    setHistory((data as Receipt[]) ?? [])
  }, [supabase])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const acceptConsent = (checked: boolean) => {
    setConsent(checked)
    if (!consentKey) return
    try {
      if (checked) localStorage.setItem(consentKey, "1")
      else localStorage.removeItem(consentKey)
    } catch {
      // Sin almacenamiento local se vuelve a pedir el consentimiento en la siguiente visita.
    }
  }

  const handleFile = async (file: File | undefined) => {
    // Sin escaneo activo no se sube nada: el archivo quedaría guardado sin poder leerse.
    if (!file || scanEnabled !== true) return
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast({ title: "Formato no compatible", description: "Sube una foto (JPG, PNG o WebP) o un PDF.", variant: "destructive" })
      return
    }
    if (file.type === "application/pdf" && file.size > MAX_PDF_MB * 1024 * 1024) {
      toast({ title: "PDF muy pesado", description: `El PDF debe pesar menos de ${MAX_PDF_MB} MB.`, variant: "destructive" })
      return
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast({ title: "Tu sesión expiró", description: "Vuelve a iniciar sesión para escanear.", variant: "destructive" })
      return
    }

    setStage("compressing")
    try {
      // La foto se reduce en el teléfono (1600 px, JPEG 0.82) y se sube directo a Supabase Storage;
      // el servidor solo recibe la ruta, así que nunca se acerca al límite de 4.5 MB de Vercel.
      const { blob, type } = await compressImage(file)
      if (!ACCEPTED_TYPES.includes(type)) {
        throw new Error("Tu navegador no pudo convertir esta foto. Tómala de nuevo o súbela como JPG.")
      }
      setStage("uploading")
      const ext = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from("receipts").upload(path, blob, { contentType: type })
      if (uploadError) throw new Error("No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.")

      setStage("analyzing")
      const res = await fetch("/api/receipts/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudo analizar el recibo.")

      setCurrent(data.receipt)
      setDudosos(data.dudosos ?? [])
      setForm(toForm(data.receipt))
      setStage("review")
      loadHistory()
    } catch (error) {
      setStage("idle")
      toast({ title: "No pudimos leer el recibo", description: error instanceof Error ? error.message : String(error), variant: "destructive" })
    } finally {
      if (fileInput.current) fileInput.current.value = ""
      if (cameraInput.current) cameraInput.current.value = ""
    }
  }

  const review = async (action: "confirm" | "reject") => {
    if (!current || !form) return
    const amount = Number(form.amount)
    if (action === "confirm" && (!form.provider.trim() || !(amount > 0))) {
      toast({ title: "Faltan datos", description: "Revisa el proveedor y el monto antes de confirmar.", variant: "destructive" })
      return
    }
    setStage("saving")
    const body =
      action === "reject"
        ? { action }
        : {
            action,
            fields: {
              provider: form.provider.trim(),
              service_type: form.service_type,
              amount,
              due_date: form.due_date || null,
              period_start: form.period_start || null,
              period_end: form.period_end || null,
              consumption: form.consumption ? Number(form.consumption) : null,
            },
          }
    const res = await fetch(`/api/receipts/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setStage("review")
      toast({ title: "No se pudo guardar", description: data.error || "Intenta de nuevo.", variant: "destructive" })
      return
    }
    toast({
      title: action === "confirm" ? "Recibo guardado" : "Recibo descartado",
      description: action === "confirm" ? `Agregamos un pago pendiente de ${formatMoney(amount)}.` : undefined,
    })
    setCurrent(null)
    setForm(null)
    setDudosos([])
    setStage("idle")
    loadHistory()
  }

  const field = (key: keyof Form, label: string, type = "text", hint?: string) => {
    const dudoso =
      (key === "provider" && dudosos.includes("proveedor")) ||
      (key === "amount" && dudosos.includes("total")) ||
      (key === "due_date" && dudosos.includes("fecha_limite")) ||
      (key === "period_start" && dudosos.includes("periodo_inicio")) ||
      (key === "period_end" && dudosos.includes("periodo_fin")) ||
      (key === "consumption" && dudosos.includes("consumo"))
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`rc-${key}`}>{label}</Label>
        <Input
          id={`rc-${key}`}
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          step={type === "number" ? "0.01" : undefined}
          value={form?.[key] ?? ""}
          onChange={(e) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f))}
          className={cn("h-12 text-base", dudoso && "border-amber-500 ring-2 ring-amber-500/30")}
          aria-describedby={dudoso ? `rc-${key}-hint` : undefined}
        />
        {dudoso ? (
          <p id={`rc-${key}-hint`} className="flex items-center gap-1 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> No se leía bien. Revisa este dato.
          </p>
        ) : hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    )
  }

  const busy = stage === "compressing" || stage === "uploading" || stage === "analyzing" || stage === "saving"
  const reviewOpen = (stage === "review" || stage === "saving") && form !== null && current !== null
  const canScan = consent && !busy && scanEnabled === true

  const closeReview = (open: boolean) => {
    // Cerrar la hoja (deslizar o Escape) deja el recibo "Por revisar" en el historial; no se pierde.
    if (!open && stage === "review") {
      setStage("idle")
      setCurrent(null)
      setForm(null)
      setDudosos([])
      loadHistory()
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-brand-spark" aria-hidden="true" /> Escanear un recibo
          </CardTitle>
          <CardDescription>
            Tómale foto a tu recibo de luz, agua, gas o internet, o sube el PDF. La IA captura el monto, la fecha límite y el
            periodo; tú revisas antes de guardar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex min-h-12 items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm" htmlFor="rc-consent">
            <Checkbox checked={consent} onCheckedChange={(v) => acceptConsent(v === true)} className="mt-0.5 size-5" id="rc-consent" />
            <span>
              Acepto que la imagen de mi recibo se envíe a {providerInfo?.company ?? "un servicio de IA"}
              {providerInfo ? ` (${providerInfo.country})` : ""} para extraer sus datos.
              {providerInfo?.trainsOnFreeTier &&
                " Este servicio usa el plan gratuito, en el que el proveedor puede usar el contenido para mejorar sus productos."}{" "}
              PagoIA guarda únicamente los últimos 4 dígitos de mi número de servicio.
            </span>
          </label>

          {scanEnabled === false && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200" role="status">
              {t("El escaneo con IA todavía no está activado en este sitio. Mientras tanto, agrega tus recibos desde Mis Pagos.")}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button size="lg" disabled={!canScan} onClick={() => cameraInput.current?.click()} className="h-14 text-base">
              <Camera className="mr-2 h-5 w-5" aria-hidden="true" /> Tomar foto
            </Button>
            <Button size="lg" variant="outline" disabled={!canScan} onClick={() => fileInput.current?.click()} className="h-14 text-base">
              <FileUp className="mr-2 h-5 w-5" aria-hidden="true" /> Subir foto o PDF
            </Button>
          </div>
          {!consent && scanEnabled === true && (
            <p className="text-sm text-muted-foreground">Marca la casilla de arriba para activar la cámara.</p>
          )}
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          <div aria-live="polite" role="status" className="min-h-6">
            {busy && (
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
                {STAGE_MESSAGES[stage]}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Drawer open={reviewOpen} onOpenChange={closeReview}>
        <DrawerContent className="mx-auto w-full max-w-2xl data-[vaul-drawer-direction=bottom]:max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-lg">Revisa lo que capturó la IA</DrawerTitle>
            <DrawerDescription>
              {dudosos.length === 0
                ? "Todos los campos se leyeron con claridad. Corrige lo que haga falta y confirma."
                : `Revisa los ${dudosos.length} campos marcados en ámbar antes de confirmar.`}
              {current?.service_number_last4 && ` Número de servicio terminación ${current.service_number_last4}.`}
              {current?.confidence != null && ` Confianza de lectura: ${Math.round(current.confidence * 100)} %.`}
            </DrawerDescription>
          </DrawerHeader>
          {form && current && (
            <div className="overflow-y-auto px-4 pb-2">
              <div className="grid gap-4 sm:grid-cols-2">
                {field("provider", "Proveedor")}
                <div className="space-y-1.5">
                  <Label htmlFor="rc-service">Servicio</Label>
                  <Select value={form.service_type} onValueChange={(v) => setForm((f) => (f ? { ...f, service_type: v } : f))}>
                    <SelectTrigger
                      id="rc-service"
                      className={cn("h-12 w-full text-base", dudosos.includes("tipo_servicio") && "border-amber-500 ring-2 ring-amber-500/30")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SERVICE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value} className="min-h-11 text-base">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {field("amount", "Total a pagar (MXN)", "number")}
                {field("due_date", "Fecha límite de pago", "date")}
                {field("period_start", "Inicio del periodo", "date")}
                {field("period_end", "Fin del periodo", "date")}
                {field("consumption", `Consumo${current.consumption_unit ? ` (${current.consumption_unit})` : ""}`, "number")}
              </div>
            </div>
          )}
          <DrawerFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            <Button disabled={stage === "saving"} onClick={() => review("confirm")} className="h-12 text-base sm:order-2">
              {stage === "saving" ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              Confirmar y crear pago
            </Button>
            <Button variant="outline" disabled={stage === "saving"} onClick={() => review("reject")} className="h-12 text-base sm:order-1">
              Descartar
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Card>
        <CardHeader>
          <CardTitle>Recibos recientes</CardTitle>
          <CardDescription>
            Los recibos confirmados aparecen como pagos pendientes en{" "}
            <Link href="/dashboard/servicios" className="text-primary underline-offset-4 hover:underline">
              Mis Pagos
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no has escaneado recibos.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {SERVICE_LABELS[r.service_type ?? "other"] ?? "Servicio"} · {r.provider ?? "Proveedor sin leer"}
                    </p>
                    <p className="text-muted-foreground">
                      Vence {formatDate(r.due_date)} · escaneado {formatDate(r.created_at.slice(0, 10))}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums">{formatMoney(r.amount)}</span>
                    <StatusChip status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusChip({ status }: { status: Receipt["status"] }) {
  if (status === "confirmed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-300">
        <CheckCircle2 className="h-3 w-3" /> Confirmado
      </span>
    )
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
        <XCircle className="h-3 w-3" /> Descartado
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
      <AlertTriangle className="h-3 w-3" /> Por revisar
    </span>
  )
}
