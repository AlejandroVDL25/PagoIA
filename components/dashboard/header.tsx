"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogOut, Settings, User as UserIcon } from "lucide-react"
import { NotificationsDropdown } from "@/components/dashboard/notifications-dropdown"
import type { User } from "@supabase/supabase-js"
import { Logo } from "@/components/brand/logo"

interface DashboardHeaderProps {
  user: User
}

function metadataString(user: User, key: string): string | null {
  const value: unknown = user.user_metadata?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function greeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return "Buenos días"
  if (hour < 19) return "Buenas tardes"
  return "Buenas noches"
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const [loading, setLoading] = useState(false)
  const [online, setOnline] = useState(true)
  const [hello, setHello] = useState("Hola")
  const router = useRouter()

  const fullName = metadataString(user, "full_name")
  const avatarUrl = metadataString(user, "avatar_url")
  const firstName = fullName?.split(/\s+/)[0] ?? user.email?.split("@")[0] ?? "Usuario"
  const userInitials = fullName
    ? fullName
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n.charAt(0))
        .join("")
        .toUpperCase()
    : (user.email?.charAt(0).toUpperCase() ?? "U")

  // El saludo depende de la hora local del usuario, así que se calcula ya en el navegador.
  useEffect(() => {
    setHello(greeting(new Date()))
    setOnline(navigator.onLine)
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  const handleLogout = async () => {
    setLoading(true)
    await createClient().auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-2 border-b border-border bg-card/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {/* Móvil: avatar con menú + saludo. Escritorio: logo. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-12 w-12 shrink-0 rounded-full p-0 md:hidden" aria-label="Abrir menú de tu cuenta">
              <Avatar className="h-10 w-10 border-2 border-primary">
                {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                <AvatarFallback className="bg-primary font-bold text-primary-foreground">{userInitials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <AccountMenuContent fullName={fullName} email={user.email ?? ""} loading={loading} onLogout={handleLogout} />
        </DropdownMenu>

        <div className="min-w-0 md:hidden">
          <p className="truncate text-base font-semibold leading-tight text-foreground">
            {hello}, {firstName}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-green-600" : "bg-amber-500"}`} aria-hidden="true" />
            {online ? "Sincronizado" : "Sin conexión"}
          </p>
        </div>

        <Link href="/dashboard" className="hidden items-center gap-2 transition-opacity hover:opacity-80 md:flex" aria-label="Ir al inicio">
          <Logo markClassName="h-10 w-10" wordmarkClassName="text-lg" />
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        <Button asChild variant="ghost" size="icon" className="hidden h-12 w-12 rounded-full text-muted-foreground hover:text-foreground md:inline-flex">
          <Link href="/dashboard/configuracion" aria-label="Configuración">
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Link>
        </Button>

        <NotificationsDropdown />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative hidden h-12 w-12 rounded-full p-0 md:inline-flex" aria-label="Abrir menú de tu cuenta">
              <Avatar className="h-10 w-10 border-2 border-primary">
                {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                <AvatarFallback className="bg-primary font-bold text-primary-foreground">{userInitials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <AccountMenuContent fullName={fullName} email={user.email ?? ""} loading={loading} onLogout={handleLogout} />
        </DropdownMenu>
      </div>
    </header>
  )
}

function AccountMenuContent({
  fullName,
  email,
  loading,
  onLogout,
}: {
  fullName: string | null
  email: string
  loading: boolean
  onLogout: () => void
}) {
  return (
    <DropdownMenuContent className="w-60 border-border bg-card" align="end" forceMount>
      <DropdownMenuLabel className="font-normal">
        <div className="flex flex-col space-y-1">
          <p className="text-sm font-medium text-foreground">{fullName ?? "Usuario"}</p>
          <p className="truncate text-sm text-muted-foreground">{email}</p>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator className="bg-border" />
      <DropdownMenuItem asChild className="min-h-11 cursor-pointer text-foreground">
        <Link href="/dashboard/perfil" className="flex w-full items-center gap-2">
          <UserIcon className="h-4 w-4" aria-hidden="true" />
          <span>Perfil</span>
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="min-h-11 cursor-pointer text-foreground">
        <Link href="/dashboard/configuracion" className="flex w-full items-center gap-2">
          <Settings className="h-4 w-4" aria-hidden="true" />
          <span>Configuración</span>
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-border" />
      <DropdownMenuItem onClick={onLogout} disabled={loading} className="min-h-11 cursor-pointer gap-2 text-red-700 dark:text-red-400">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span>{loading ? "Cerrando sesión..." : "Cerrar sesión"}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
