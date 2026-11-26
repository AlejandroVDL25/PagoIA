"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RevenueChart } from "@/components/dashboard/revenue-chart"
import { SmartAlerts } from "@/components/dashboard/smart-alerts"
import { ServiceStatus } from "@/components/dashboard/service-status"
import { PaymentMethodSelector } from "@/components/dashboard/payment-method-selector"
import { SpendingAnalysis } from "@/components/dashboard/spending-analysis"
import { HomeOverview } from "@/components/dashboard/home-overview"
import { useToast } from "@/hooks/use-toast"

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()

  // Regreso desde Stripe a /dashboard?payment=...: avisar y limpiar la URL.
  useEffect(() => {
    const paymentStatus = searchParams.get("payment")
    const service = searchParams.get("service")
    if (paymentStatus === "success") {
      toast({
        title: "Pago realizado",
        description: `Tu pago de ${service || "el servicio"} se procesó correctamente.`,
        duration: 5000,
      })
      router.replace("/dashboard", { scroll: false })
    } else if (paymentStatus === "cancelled") {
      toast({ title: "Pago cancelado", description: "El proceso de pago se canceló.", variant: "destructive", duration: 5000 })
      router.replace("/dashboard", { scroll: false })
    }
  }, [searchParams, toast, router])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <h1 className="sr-only">Inicio</h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        <HomeOverview />
        <div className="space-y-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base text-foreground sm:text-lg">Pronóstico de gastos (IA)</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueChart />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SmartAlerts />
        <ServiceStatus />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PaymentMethodSelector />
        <SpendingAnalysis />
      </div>
    </div>
  )
}
