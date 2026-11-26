import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { ThemeProvider } from '@/components/theme-provider'
import { FloatingAIPaymentSupport } from '@/components/floating-ai-payment-support'
import { PushNotificationsManager } from '@/components/push-notifications-manager'
import { Toaster } from '@/components/ui/toaster'
import { LocaleProvider } from '@/components/i18n/locale-provider'
import { getBaseUrl } from '@/lib/app-url'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // "cover" hace que env(safe-area-inset-*) funcione en iPhone con notch o barra de inicio.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f6f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1929' },
  ],
}

const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim()

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: 'PagoIA - Gestión de Pagos con IA',
  description: 'Simplifica y automatiza tus pagos de servicios con inteligencia artificial',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    siteName: 'PagoIA',
    title: 'PagoIA - Gestión de Pagos con IA',
    description: 'Paga tu luz, agua, gas e internet, escanea tus recibos con IA y recibe recordatorios antes de que venzan.',
  },
  // Código de Google Search Console (método "Etiqueta HTML"). Se configura en Vercel, sin tocar el código.
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PagoIA',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es-MX" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${bricolage.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <LocaleProvider>
            {children}
            <Toaster />
            <PushNotificationsManager />
            <FloatingAIPaymentSupport />
          </LocaleProvider>
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
