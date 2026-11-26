import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/admin-auth"
import { AdminServicesPanel } from "@/components/admin/services-panel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login?next=/admin")
  }

  if (!isAdminUser(user)) {
    return (
      <div className="container mx-auto py-10">
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="w-5 h-5" />
              Acceso Denegado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-amber-600">
              No tienes permisos para acceder al panel administrativo. Solo los administradores pueden gestionar servicios.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 space-y-6">
      <div>
        <h1 className="text-4xl font-bold">Panel Administrativo</h1>
        <p className="text-muted-foreground mt-2">
          Gestiona todos los servicios disponibles en la plataforma
        </p>
      </div>

      <AdminServicesPanel />
    </div>
  )
}
