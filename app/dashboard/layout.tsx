import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { MobileNavigation } from "@/components/dashboard/mobile-navigation"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <div className="min-h-dvh w-full max-w-full bg-background flex overflow-x-clip">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <DashboardSidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader user={user} />
        {/* En móvil se deja espacio para la barra inferior fija y el área segura del iPhone. */}
        <main className="flex-1 w-full min-w-0 max-w-full px-4 pt-4 sm:px-6 sm:pt-6 bg-background overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-6">
          {/* En monitores grandes el contenido no se estira de lado a lado. */}
          <div className="mx-auto w-full min-w-0 max-w-7xl">{children}</div>
        </main>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-50">
        <MobileNavigation />
      </div>
    </div>
  )
}
