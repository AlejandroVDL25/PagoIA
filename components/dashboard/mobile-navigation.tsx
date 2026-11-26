"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  CalendarDays,
  FileText,
  HelpCircle,
  History,
  Home,
  LayoutGrid,
  PiggyBank,
  Receipt,
  Repeat,
  ScanLine,
  Settings,
  User,
  Users,
  Bell,
} from "lucide-react"
import { Sheet, SheetContent, SheetTitle, SheetClose, SheetDescription } from "@/components/ui/sheet"
import { Logo } from "@/components/brand/logo"
import { cn } from "@/lib/utils"

type NavItem = { name: string; href: string; icon: LucideIcon }

const PRIMARY_TABS: [NavItem, NavItem, NavItem, NavItem] = [
  { name: "Inicio", href: "/dashboard", icon: Home },
  { name: "Pagos", href: "/dashboard/servicios", icon: Receipt },
  { name: "Movimientos", href: "/dashboard/historial", icon: History },
  { name: "Más", href: "#mas", icon: LayoutGrid },
]

const SCAN_HREF = "/dashboard/recibos"

const MORE_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Gestión",
    items: [
      { name: "Calendario", href: "/dashboard/calendario", icon: CalendarDays },
      { name: "Presupuestos", href: "/dashboard/presupuestos", icon: PiggyBank },
      { name: "Pagos automáticos", href: "/dashboard/programados", icon: Repeat },
      { name: "Hogar", href: "/dashboard/hogar", icon: Users },
      { name: "Estados de cuenta", href: "/dashboard/estados", icon: FileText },
      { name: "Comparativo", href: "/dashboard/comparativo", icon: BarChart3 },
      { name: "Notificaciones", href: "/dashboard/notificaciones", icon: Bell },
      { name: "Soporte", href: "/dashboard/soporte", icon: HelpCircle },
    ],
  },
  {
    title: "Tu cuenta",
    items: [
      { name: "Mi perfil", href: "/dashboard/perfil", icon: User },
      { name: "Configuración", href: "/dashboard/configuracion", icon: Settings },
    ],
  },
]

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("h-6 w-6", active && "stroke-[2.5]")} aria-hidden="true" />
      <span className="leading-none">{item.name}</span>
    </Link>
  )
}

/**
 * Barra inferior fija para móvil: 4 pestañas y botón central elevado para escanear con IA.
 * El contenedor del layout la muestra solo debajo de md (768 px).
 */
export function MobileNavigation() {
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = usePathname()
  const [home, payments, activity, more] = PRIMARY_TABS
  const moreActive = MORE_SECTIONS.some((section) => section.items.some((item) => isActivePath(pathname, item.href)))
  const scanActive = isActivePath(pathname, SCAN_HREF)

  return (
    <nav
      aria-label="Navegación principal"
      className="border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-card/85"
    >
      <ul className="mx-auto flex max-w-md items-end justify-between px-2 pt-1">
        <li className="flex flex-1">
          <TabLink item={home} active={isActivePath(pathname, home.href)} />
        </li>
        <li className="flex flex-1">
          <TabLink item={payments} active={isActivePath(pathname, payments.href)} />
        </li>
        <li className="flex flex-1 justify-center">
          <Link
            href={SCAN_HREF}
            aria-label="Escanear recibo con IA"
            aria-current={scanActive ? "page" : undefined}
            className="group -mt-6 flex flex-col items-center gap-1 rounded-2xl focus-visible:outline-none"
          >
            <span
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform",
                "group-active:scale-95 group-focus-visible:ring-ring",
                scanActive && "bg-primary/90",
              )}
            >
              <ScanLine className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className={cn("pb-1 text-xs font-semibold", scanActive ? "text-primary" : "text-foreground")}>Escanear</span>
          </Link>
        </li>
        <li className="flex flex-1">
          <TabLink item={activity} active={isActivePath(pathname, activity.href)} />
        </li>
        <li className="flex flex-1">
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <more.icon className="h-6 w-6" aria-hidden="true" />
            <span className="leading-none">{more.name}</span>
          </button>
        </li>
      </ul>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2 px-4 pt-4">
            <Logo markClassName="h-8 w-8" wordmarkClassName="text-lg" />
          </div>
          <SheetTitle className="px-4 pt-2 text-lg">Todas las secciones</SheetTitle>
          <SheetDescription className="sr-only">Accesos a todas las secciones de PagoIA</SheetDescription>
          {MORE_SECTIONS.map((section) => (
            <section key={section.title} className="px-4 pt-4" aria-label={section.title}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{section.title}</h3>
              <ul className="grid grid-cols-3 gap-2">
                {section.items.map((item) => {
                  const active = isActivePath(pathname, item.href)
                  const Icon = item.icon
                  return (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center text-sm font-medium transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-secondary",
                          )}
                        >
                          <Icon className="h-6 w-6" aria-hidden="true" />
                          <span className="leading-tight">{item.name}</span>
                        </Link>
                      </SheetClose>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </SheetContent>
      </Sheet>
    </nav>
  )
}
