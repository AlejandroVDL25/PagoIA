"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, Home, RefreshCcw } from "lucide-react"

/** Error de cualquier página fuera del panel (inicio, acceso, admin). Nunca muestra detalles técnicos. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import("@sentry/nextjs").then(({ captureException }) => captureException(error))
    }
    console.error("[RootError]", error.digest ?? "", error)
  }, [error])

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md text-center" role="alert">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Algo salió mal</h1>
        <p className="mt-3 text-base text-muted-foreground">
          No pudimos mostrar esta página. Puede ser un problema temporal de conexión; intenta de nuevo.
        </p>
        {error.digest && <p className="mt-2 text-sm text-muted-foreground">Código de referencia: {error.digest}</p>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <RefreshCcw className="h-5 w-5" aria-hidden="true" />
            Reintentar
          </button>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-5 text-base font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Home className="h-5 w-5" aria-hidden="true" />
            Página principal
          </Link>
        </div>
      </div>
    </main>
  )
}
