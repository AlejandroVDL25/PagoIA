"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertCircle, Home, RefreshCcw } from "lucide-react"

/** Error dentro del panel: conserva la barra lateral y la barra inferior, y no muestra detalles técnicos. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import("@sentry/nextjs").then(({ captureException }) => captureException(error))
    }
    console.error("[DashboardError]", error.digest ?? "", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center py-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm" role="alert">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-foreground">No se pudo cargar esta sección</h2>
        <p className="mt-2 text-base text-muted-foreground">
          Puede deberse a una conexión inestable o a un problema temporal. Tus datos están a salvo.
        </p>
        {error.digest && <p className="mt-2 text-sm text-muted-foreground">Código de referencia: {error.digest}</p>}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCcw className="h-5 w-5" aria-hidden="true" />
            Reintentar
          </button>
          <Link
            href="/dashboard"
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 text-base font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Home className="h-5 w-5" aria-hidden="true" />
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
