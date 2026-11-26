import Link from "next/link"
import { Compass, Home, LayoutDashboard } from "lucide-react"
import { Logo } from "@/components/brand/logo"

export const metadata = { title: "Página no encontrada · PagoIA" }

/** 404 para cualquier ruta inexistente, en móvil y en escritorio. */
export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="mx-auto mb-8 inline-flex items-center gap-2" aria-label="Ir al inicio de PagoIA">
          <Logo markClassName="h-12 w-12" wordmarkClassName="text-2xl" />
        </Link>
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Compass className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-primary">Error 404</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">No encontramos esta página</h1>
        <p className="mt-3 text-base text-muted-foreground">
          La dirección puede estar mal escrita o la página ya no existe. Desde aquí puedes volver a tus pagos.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
            Ir a mi panel
          </Link>
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
